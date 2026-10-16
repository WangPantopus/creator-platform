package com.pantopus.qelvora.commerce

import com.pantopus.qelvora.generated.QelvoraCopy

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
                else status=if(result.responseCode==BillingClient.BillingResponseCode.USER_CANCELED) QelvoraCopy.text("nativePurchaseCancelledNothingChanged") else QelvoraCopy.text("nativeGooglePlayCouldNotCompleteThe")
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
                override fun onBillingServiceDisconnected() { status=QelvoraCopy.text("nativeGooglePlayDisconnectedReconnect");if(continuation.isActive) continuation.resume(false) }
            })
        }
    }
    suspend fun load(catalog:List<CommerceStoreProduct>) {
        products=emptyList()
        if(catalog.isEmpty()) {status=QelvoraCopy.text("nativeMembershipProductsAreNotConfigured");return}
        if(!connected()) {status=QelvoraCopy.text("nativeGooglePlayBillingIsUnavailable");return}
        val supported=client.isFeatureSupported(BillingClient.FeatureType.SUBSCRIPTIONS)
        if(supported.responseCode!=BillingClient.BillingResponseCode.OK) {status=QelvoraCopy.text("nativeGooglePlaySubscriptionsAreUnavailable");return}
        val params=QueryProductDetailsParams.newBuilder().setProductList(catalog.map {QueryProductDetailsParams.Product.newBuilder().setProductId(it.productId).setProductType(BillingClient.ProductType.SUBS).build()}).build()
        val response=suspendCancellableCoroutine<Pair<BillingResult,QueryProductDetailsResult>> { continuation ->
            client.queryProductDetailsAsync(params) { result,details -> if(continuation.isActive) continuation.resume(result to details) }
        }
        if(response.first.responseCode!=BillingClient.BillingResponseCode.OK) {status=QelvoraCopy.text("nativeThePlayCatalogIsUnavailableReconnect");return}
        products=response.second.productDetailsList.flatMap { detail ->
            detail.subscriptionOfferDetails.orEmpty().filter { offer ->
                catalog.any {it.productId==detail.productId && it.basePlanId==offer.basePlanId} && offer.offerId==null &&
                    offer.pricingPhases.pricingPhaseList.size==1 && offer.pricingPhases.pricingPhaseList.single().billingPeriod=="P1M" &&
                    offer.pricingPhases.pricingPhaseList.single().recurrenceMode==ProductDetails.RecurrenceMode.INFINITE_RECURRING
            }.map { PlayMembershipProduct(detail,it) }
        }
        status=if(products.isEmpty()) QelvoraCopy.text("nativeNoApprovedMonthlyMembershipProducts") else ""
    }
    fun purchase(context:Context,product:PlayMembershipProduct) {
        if(!scope.isActive || busy || !client.isReady || products.none {it.detail.productId==product.detail.productId && it.offer.offerToken==product.offer.offerToken}) return
        val host=activity(context) ?: run {status=QelvoraCopy.text("nativeThePurchaseSheetNeedsTheActive");return}
        val params=BillingFlowParams.newBuilder().setObfuscatedAccountId(accountBinding(accountId))
            .setProductDetailsParamsList(listOf(BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(product.detail).setOfferToken(product.offer.offerToken).build())).build()
        busy=true
        val result=client.launchBillingFlow(host,params)
        if(result.responseCode!=BillingClient.BillingResponseCode.OK) {busy=false;status=QelvoraCopy.text("nativeThePlayPurchaseSheetIsUnavailable")}
    }
    suspend fun restore() {
        if(busy) return
        busy=true
        try {
            if(!connected()) {status=QelvoraCopy.text("nativeGooglePlayIsUnavailableRestore");return}
            val response=suspendCancellableCoroutine<Pair<BillingResult,List<Purchase>>> { continuation ->
                client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).includeSuspendedSubscriptions(true).build()) { result,purchases -> if(continuation.isActive) continuation.resume(result to purchases) }
            }
            if(response.first.responseCode!=BillingClient.BillingResponseCode.OK) {status=QelvoraCopy.text("nativeRestoreCouldNotReachGooglePlay");return}
            if(response.second.isEmpty()) status=QelvoraCopy.text("nativeGooglePlayFoundNoCurrentPurchases")
            response.second.forEach {reconcile(it)}
        } finally {busy=false}
    }
    private suspend fun reconcile(purchase:Purchase) {
        if(purchase.purchaseState==Purchase.PurchaseState.PENDING) {status=QelvoraCopy.text("nativePurchaseIsPendingWithGooglePlay");return}
        if(purchase.purchaseState!=Purchase.PurchaseState.PURCHASED) {status=QelvoraCopy.text("nativePurchaseStatusIsUnavailableRestore");return}
        if(purchase.accountIdentifiers?.obfuscatedAccountId!=accountBinding(accountId)) {status=QelvoraCopy.text("nativeThisPurchaseBelongsToAnother");return}
        try {
            val confirmed=deliver(purchase.purchaseToken)
            currentCoroutineContext().ensureActive()
            if(!scope.isActive) return
            status=if(confirmed) QelvoraCopy.text("nativePurchaseVerifiedByTheServerRefreshing") else QelvoraCopy.text("nativeServerVerificationIsProcessing")
        } catch(error:CancellationException) {throw error}
        catch(_:Exception) {status=QelvoraCopy.text("nativeServerVerificationIsUnavailable")}
    }
}

@Composable fun StoreMembershipPane(context:Context,accountId:String,client:CommerceClient,catalog:List<CommerceStoreProduct>,available:Boolean,refresh:suspend ()->Unit) {
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
        Button(QelvoraCopy.text("nativeNamePriceMonth", mapOf("name" to product.detail.name, "price" to price)),ButtonVariant.SECONDARY,block=true,disabled=coordinator.busy || !available) {coordinator.purchase(context,product)}
    }
    Button(QelvoraCopy.text("nativeRestorePurchases"),ButtonVariant.QUIET,disabled=coordinator.busy || !available) {scope.launch {coordinator.restore()}}
    StoreSubscriptionManagement(context,disabled=coordinator.busy)
    if(coordinator.status.isNotEmpty()) Notice(title=QelvoraCopy.text("nativeStoreStatus"),children=coordinator.status)
}

/** Opening store settings never grants access or infers a cancellation. */
@Composable internal fun StoreSubscriptionManagement(context:Context,disabled:Boolean=false) {
    var unavailable by remember {mutableStateOf(false)}
    Button(QelvoraCopy.text("nativeManageInGooglePlay"),ButtonVariant.QUIET,disabled=disabled) {
        unavailable=false
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://play.google.com/store/account/subscriptions")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch(_:RuntimeException) {unavailable=true}
    }
    if(unavailable) Notice(title=QelvoraCopy.text("nativeStoreSettingsUnavailable"),children=QelvoraCopy.text("nativeOpenPlayStoreThenPaymentsSubscriptions"))
}
