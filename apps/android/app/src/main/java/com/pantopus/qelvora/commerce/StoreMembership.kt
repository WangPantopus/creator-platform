package com.pantopus.qelvora.commerce

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.*
import com.android.billingclient.api.*
import com.pantopus.qelvora.ui.*
import java.security.MessageDigest
import kotlinx.coroutines.*
import kotlin.coroutines.resume

private fun accountBinding(accountId:String):String = MessageDigest.getInstance("SHA-256")
    .digest("commerce:v1:${accountId.lowercase()}".toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it.toInt() and 0xff) }
private fun activity(context:Context):Activity? = when(context) { is Activity -> context; is ContextWrapper -> activity(context.baseContext); else -> null }

data class PlayMembershipProduct(val detail:ProductDetails,val offer:ProductDetails.SubscriptionOfferDetails)

/** Server confirmation is the only access authority. This coordinator never
 * acknowledges a purchase locally before the durable server grant. */
class StoreMembershipCoordinator(context:Context,private val accountId:String,private val deliver:suspend (String)->Boolean) {
    var products by mutableStateOf<List<PlayMembershipProduct>>(emptyList()); private set
    var status by mutableStateOf(""); private set
    var busy by mutableStateOf(false); private set
    private val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
    private val client=BillingClient.newBuilder(context.applicationContext)
        .setListener { result,purchases ->
            if(scope.isActive) scope.launch {
                if(result.responseCode==BillingClient.BillingResponseCode.OK) purchases.orEmpty().forEach { reconcile(it) }
                else status=if(result.responseCode==BillingClient.BillingResponseCode.USER_CANCELED) "Purchase cancelled. Nothing changed." else "Google Play could not complete the purchase. Restore to check its current status."
                busy=false
            }
        }
        .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
        .enableAutoServiceReconnection()
        .build()
    fun close() { scope.cancel();client.endConnection() }
    private suspend fun connected():Boolean {
        if(client.isReady) return true
        return suspendCancellableCoroutine { continuation ->
            client.startConnection(object:BillingClientStateListener {
                override fun onBillingSetupFinished(result:BillingResult) { if(continuation.isActive) continuation.resume(result.responseCode==BillingClient.BillingResponseCode.OK) }
                override fun onBillingServiceDisconnected() { status="Google Play disconnected. Reconnect to purchase or restore.";if(continuation.isActive) continuation.resume(false) }
            })
        }
    }
    suspend fun load(catalog:List<CommerceStoreProduct>) {
        products=emptyList()
        if(catalog.isEmpty()) {status="Membership products are not configured.";return}
        if(!connected()) {status="Google Play Billing is unavailable on this device.";return}
        val supported=client.isFeatureSupported(BillingClient.FeatureType.SUBSCRIPTIONS)
        if(supported.responseCode!=BillingClient.BillingResponseCode.OK) {status="Google Play subscriptions are unavailable on this device.";return}
        val params=QueryProductDetailsParams.newBuilder().setProductList(catalog.map {QueryProductDetailsParams.Product.newBuilder().setProductId(it.productId).setProductType(BillingClient.ProductType.SUBS).build()}).build()
        val response=suspendCancellableCoroutine<Pair<BillingResult,QueryProductDetailsResult>> { continuation ->
            client.queryProductDetailsAsync(params) { result,details -> if(continuation.isActive) continuation.resume(result to details) }
        }
        if(response.first.responseCode!=BillingClient.BillingResponseCode.OK) {status="The Play catalog is unavailable. Reconnect to try again.";return}
        products=response.second.productDetailsList.flatMap { detail ->
            detail.subscriptionOfferDetails.orEmpty().filter { offer ->
                catalog.any {it.productId==detail.productId && it.basePlanId==offer.basePlanId} && offer.offerId==null &&
                    offer.pricingPhases.pricingPhaseList.size==1 && offer.pricingPhases.pricingPhaseList.single().billingPeriod=="P1M" &&
                    offer.pricingPhases.pricingPhaseList.single().recurrenceMode==ProductDetails.RecurrenceMode.INFINITE_RECURRING
            }.map { PlayMembershipProduct(detail,it) }
        }
        status=if(products.isEmpty()) "No approved monthly membership products are available in Google Play." else ""
    }
    fun purchase(context:Context,product:PlayMembershipProduct) {
        if(busy || !client.isReady || products.none {it.detail.productId==product.detail.productId && it.offer.offerToken==product.offer.offerToken}) return
        val host=activity(context) ?: run {status="The purchase sheet needs the active app screen.";return}
        val params=BillingFlowParams.newBuilder().setObfuscatedAccountId(accountBinding(accountId))
            .setProductDetailsParamsList(listOf(BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(product.detail).setOfferToken(product.offer.offerToken).build())).build()
        busy=true
        val result=client.launchBillingFlow(host,params)
        if(result.responseCode!=BillingClient.BillingResponseCode.OK) {busy=false;status="The Play purchase sheet is unavailable. Restore to check existing purchases."}
    }
    suspend fun restore() {
        if(busy) return
        busy=true
        try {
            if(!connected()) {status="Google Play is unavailable. Restore when connected.";return}
            val response=suspendCancellableCoroutine<Pair<BillingResult,List<Purchase>>> { continuation ->
                client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).includeSuspendedSubscriptions(true).build()) { result,purchases -> if(continuation.isActive) continuation.resume(result to purchases) }
            }
            if(response.first.responseCode!=BillingClient.BillingResponseCode.OK) {status="Restore could not reach Google Play. No local receipt grants access.";return}
            if(response.second.isEmpty()) status="Google Play found no current purchases for this store account."
            response.second.forEach {reconcile(it)}
        } finally {busy=false}
    }
    private suspend fun reconcile(purchase:Purchase) {
        if(purchase.purchaseState==Purchase.PurchaseState.PENDING) {status="Purchase is pending with Google Play. No access has been granted.";return}
        if(purchase.purchaseState!=Purchase.PurchaseState.PURCHASED) {status="Purchase status is unavailable. Restore to check its current state.";return}
        if(purchase.accountIdentifiers?.obfuscatedAccountId!=accountBinding(accountId)) {status="This purchase belongs to another app account. Switch to its original account before restoring.";return}
        try {
            val confirmed=deliver(purchase.purchaseToken)
            status=if(confirmed) "Purchase verified by the server. Refreshing access." else "Server verification is processing. Access refreshes when confirmed."
        } catch(error:CancellationException) {throw error}
        catch(_:Exception) {status="Server verification is unavailable. Restore when connected; this purchase remains recoverable."}
    }
}

@Composable fun StoreMembershipPane(context:Context,accountId:String,client:CommerceClient,catalog:List<CommerceStoreProduct>,refresh:suspend ()->Unit) {
    val scope=rememberCoroutineScope()
    val coordinator=remember(accountId,client) {StoreMembershipCoordinator(context,accountId) { token ->
        val result=client.request("stores/verify", kotlinx.serialization.json.buildJsonObject {
            put("platform",kotlinx.serialization.json.JsonPrimitive("google"));put("transaction",kotlinx.serialization.json.JsonPrimitive(token))
        }).let {it as kotlinx.serialization.json.JsonObject}
        val verified=(result["serverVerified"] as? kotlinx.serialization.json.JsonPrimitive)?.content=="true"
        if(verified) refresh()
        verified
    }}
    DisposableEffect(coordinator) {onDispose {coordinator.close()}}
    LaunchedEffect(coordinator,catalog) {coordinator.load(catalog)}
    coordinator.products.forEach { product ->
        val price=product.offer.pricingPhases.pricingPhaseList.single().formattedPrice
        Button("${product.detail.name} · $price / month",ButtonVariant.SECONDARY,block=true,disabled=coordinator.busy) {coordinator.purchase(context,product)}
    }
    Button("Restore purchases",ButtonVariant.QUIET,disabled=coordinator.busy) {scope.launch {coordinator.restore()}}
    StoreSubscriptionManagement(context,disabled=coordinator.busy)
    if(coordinator.status.isNotEmpty()) Notice(title="Store status",children=coordinator.status)
}

/** Opening store settings never grants access or infers a cancellation. */
@Composable internal fun StoreSubscriptionManagement(context:Context,disabled:Boolean=false) {
    var unavailable by remember {mutableStateOf(false)}
    Button("Manage in Google Play",ButtonVariant.QUIET,disabled=disabled) {
        unavailable=false
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://play.google.com/store/account/subscriptions")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch(_:RuntimeException) {unavailable=true}
    }
    if(unavailable) Notice(title="Store settings unavailable",children="Open Play Store, then Payments & subscriptions, then Subscriptions to manage your membership.")
}
