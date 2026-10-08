import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spec = JSON.parse(
  fs.readFileSync(
    path.join(root, "packages/api/generated/openapi.json"),
    "utf8",
  ),
);
const check = process.argv.includes("--check");
const navigation = JSON.parse(
  fs.readFileSync(path.join(root, "config/navigation.json"), "utf8"),
);
const models = new Map();
const pascal = (value) =>
  value.replace(/(^|[^A-Za-z0-9])([A-Za-z0-9])/g, (_, __, letter) =>
    letter.toUpperCase(),
  );
const modelName = (value) => `API${pascal(value)}`;
const nullable = (schema) =>
  (Array.isArray(schema.type) && schema.type.includes("null")) ||
  (schema.anyOf ?? schema.oneOf ?? []).some((item) => item.type === "null");
const nullableField = (schema, seen = new Set()) => {
  if (nullable(schema)) return true;
  const reference = schema.$ref;
  if (!reference?.startsWith("#/components/schemas/") || seen.has(reference))
    return false;
  const target = spec.components.schemas[reference.split("/").pop()];
  return target ? nullableField(target, new Set([...seen, reference])) : false;
};
const concrete = (schema) => {
  const alternatives = schema.anyOf ?? schema.oneOf;
  if (
    alternatives?.length === 2 &&
    alternatives.some((item) => item.type === "null")
  )
    return alternatives.find((item) => item.type !== "null");
  return schema;
};
const primitiveType = (schema) =>
  Array.isArray(schema.type)
    ? schema.type.find((value) => value !== "null")
    : schema.type;
function register(name, schema) {
  if (models.has(name)) return;
  if (nullable(schema)) {
    models.set(name, { kind: "nullable", schema });
    fieldType(concrete(schema), `${name}Value`);
    return;
  }
  schema = concrete(schema);
  if (schema.type === "object" && schema.properties) {
    models.set(name, { kind: "object", schema });
    for (const [key, value] of Object.entries(schema.properties))
      fieldType(value, `${name}${pascal(key)}`);
  } else if (typeof schema.const === "boolean") {
    models.set(name, { kind: "booleanLiteral", schema });
  } else if (typeof schema.const === "string") {
    models.set(name, {
      kind: "enum",
      schema: { ...schema, enum: [schema.const] },
    });
  } else if (
    schema.enum &&
    schema.enum.every((value) => typeof value === "string")
  )
    models.set(name, { kind: "enum", schema });
  else {
    models.set(name, { kind: "alias", schema });
    fieldType(schema, `${name}Value`);
  }
}
function fieldType(schema, name, language = "swift") {
  schema = concrete(schema);
  if (schema.$ref?.startsWith("#/components/schemas/"))
    return modelName(schema.$ref.split("/").pop());
  if (typeof schema.const === "string" || typeof schema.const === "boolean") {
    register(name, schema);
    return name;
  }
  if (schema.enum?.every((value) => typeof value === "string")) {
    register(name, schema);
    return name;
  }
  if (schema.type === "object" && schema.properties) {
    register(name, schema);
    return name;
  }
  const type = primitiveType(schema);
  if (type === "object" && schema.additionalProperties) {
    const item =
      schema.additionalProperties === true
        ? language === "swift"
          ? "APIJSONValue"
          : "JsonElement"
        : fieldType(schema.additionalProperties, `${name}Value`, language);
    return language === "swift" ? `[String: ${item}]` : `Map<String, ${item}>`;
  }
  if (type === "array")
    return language === "swift"
      ? `[${fieldType(schema.items, `${name}Item`, language)}]`
      : `List<${fieldType(schema.items, `${name}Item`, language)}>`;
  return (
    {
      string: "String",
      integer: language === "swift" ? "Int" : "Long",
      number: "Double",
      boolean: language === "swift" ? "Bool" : "Boolean",
    }[type] ?? (language === "swift" ? "APIJSONValue" : "JsonElement")
  );
}
for (const [name, schema] of Object.entries(spec.components.schemas))
  register(modelName(name), schema);
const operations = Object.entries(spec.paths).flatMap(([route, item]) =>
  ["get", "post", "put", "delete", "patch"]
    .filter((method) => item[method])
    .map((method) => ({
      route,
      method,
      operation: item[method],
      parameters: [
        ...(item.parameters ?? []),
        ...(item[method].parameters ?? []),
      ],
    })),
);
// Inline parameter enums must be known before models are emitted.
for (const { operation, parameters } of operations) {
  for (const parameter of parameters) {
    if (parameter.schema?.enum) {
      if (
        parameter.schema.type !== "string" ||
        !Array.isArray(parameter.schema.enum) ||
        parameter.schema.enum.length === 0 ||
        !parameter.schema.enum.every((value) => typeof value === "string")
      )
        throw new Error(
          `Unsupported parameter enum for ${operation.operationId}`,
        );
      fieldType(
        parameter.schema,
        `${pascal(operation.operationId)}${pascal(parameter.name)}`,
      );
    }
  }
}
let swift =
  "// Generated from packages/api/generated/openapi.json. Do not edit.\nimport Foundation\n\n";
let kotlin =
  "// Generated from packages/api/generated/openapi.json. Do not edit.\npackage com.pantopus.qelvora.generated\n\nimport kotlinx.serialization.Serializable\nimport kotlinx.serialization.SerialName\nimport kotlinx.serialization.Required\nimport kotlinx.serialization.KSerializer\nimport kotlinx.serialization.SerializationException\nimport kotlinx.serialization.descriptors.PrimitiveKind\nimport kotlinx.serialization.descriptors.PrimitiveSerialDescriptor\nimport kotlinx.serialization.encoding.Decoder\nimport kotlinx.serialization.encoding.Encoder\nimport kotlinx.serialization.encodeToString\nimport kotlinx.serialization.decodeFromString\nimport kotlinx.serialization.json.Json\nimport kotlinx.serialization.json.JsonElement\nimport kotlinx.coroutines.Dispatchers\nimport kotlinx.coroutines.withContext\nimport kotlinx.coroutines.withTimeout\nimport kotlinx.coroutines.suspendCancellableCoroutine\nimport kotlinx.coroutines.ensureActive\nimport okhttp3.Call\nimport okhttp3.Callback\nimport okhttp3.OkHttpClient\nimport okhttp3.Request\nimport okhttp3.Response\nimport okhttp3.MediaType.Companion.toMediaType\nimport okhttp3.RequestBody.Companion.toRequestBody\nimport java.io.IOException\nimport java.net.URLEncoder\nimport java.util.concurrent.TimeUnit\n\n";
swift += `public enum APIJSONValue: Codable, Sendable {\n  case string(String), number(Double), boolean(Bool), array([APIJSONValue]), object([String: APIJSONValue]), null\n  public init(from decoder: Decoder) throws {\n    let container = try decoder.singleValueContainer()\n    if container.decodeNil() { self = .null }\n    else if let value = try? container.decode(Bool.self) { self = .boolean(value) }\n    else if let value = try? container.decode(Double.self) { self = .number(value) }\n    else if let value = try? container.decode(String.self) { self = .string(value) }\n    else if let value = try? container.decode([APIJSONValue].self) { self = .array(value) }\n    else { self = .object(try container.decode([String: APIJSONValue].self)) }\n  }\n  public func encode(to encoder: Encoder) throws {\n    var container = encoder.singleValueContainer()\n    switch self {\n      case .string(let value): try container.encode(value)\n      case .number(let value): try container.encode(value)\n      case .boolean(let value): try container.encode(value)\n      case .array(let value): try container.encode(value)\n      case .object(let value): try container.encode(value)\n      case .null: try container.encodeNil()\n    }\n  }\n}\n\n`;
for (const [name, { kind, schema }] of models) {
  if (kind === "nullable") {
    swift += `public typealias ${name} = ${fieldType(concrete(schema), `${name}Value`)}?\n\n`;
    kotlin += `typealias ${name} = ${fieldType(concrete(schema), `${name}Value`, "kotlin")}?\n\n`;
  } else if (kind === "alias") {
    swift += `public typealias ${name} = ${fieldType(schema, `${name}Value`)}\n\n`;
    kotlin += `typealias ${name} = ${fieldType(schema, `${name}Value`, "kotlin")}\n\n`;
  } else if (kind === "enum") {
    swift += `public enum ${name}: String, Codable, Sendable {\n${schema.enum.map((value) => `  case \`${value.replace(/[^A-Za-z0-9_]/g, "_")}\` = ${JSON.stringify(value)}`).join("\n")}\n}\n\n`;
    kotlin += `@Serializable\nenum class ${name} {\n${schema.enum.map((value) => `  @SerialName(${JSON.stringify(value)}) ${value.replace(/[^A-Za-z0-9_]/g, "_").toUpperCase()}`).join(",\n")}\n}\n\n`;
  } else if (kind === "booleanLiteral") {
    swift += `public struct ${name}: Codable, Sendable {\n  public let value: Bool = ${schema.const}\n  public init() {}\n  public init(from decoder: Decoder) throws {\n    let container = try decoder.singleValueContainer()\n    guard try container.decode(Bool.self) == ${schema.const} else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected ${schema.const}") }\n  }\n  public func encode(to encoder: Encoder) throws { var container = encoder.singleValueContainer(); try container.encode(${schema.const}) }\n}\n\n`;
    kotlin += `@Serializable(with = ${name}Serializer::class)\nobject ${name} { const val value: Boolean = ${schema.const} }\nobject ${name}Serializer : KSerializer<${name}> {\n  override val descriptor = PrimitiveSerialDescriptor("${name}", PrimitiveKind.BOOLEAN)\n  override fun deserialize(decoder: Decoder): ${name} {\n    if (decoder.decodeBoolean() != ${schema.const}) throw SerializationException("Expected ${schema.const}")\n    return ${name}\n  }\n  override fun serialize(encoder: Encoder, value: ${name}) { encoder.encodeBoolean(${schema.const}) }\n}\n\n`;
  } else {
    const properties = Object.entries(schema.properties).map(
      ([key, value]) => ({
        key,
        value,
        required: Boolean(schema.required?.includes(key)),
        requiredNullable:
          Boolean(schema.required?.includes(key)) && nullableField(value),
        optional: !schema.required?.includes(key) || nullable(value),
      }),
    );
    const swiftFieldType = ({ key, value, optional }) =>
      `${fieldType(value, `${name}${pascal(key)}`)}${optional ? "?" : ""}`;
    // A required nullable key must be present as either a value or JSON null.
    // Synthesized Codable treats Optional properties as absent-key defaults.
    const swiftCodable = properties.some(
      ({ requiredNullable }) => requiredNullable,
    )
      ? `  private enum CodingKeys: String, CodingKey {\n${properties.map(({ key }) => `    case \`${key}\``).join("\n")}\n  }\n  public init(from decoder: Decoder) throws {\n    let container = try decoder.container(keyedBy: CodingKeys.self)\n${properties.map((property) => `    self.${property.key} = try container.${property.required ? "decode" : "decodeIfPresent"}(${property.required ? swiftFieldType(property) : fieldType(property.value, `${name}${pascal(property.key)}`)}.self, forKey: .${property.key})`).join("\n")}\n  }\n  public func encode(to encoder: Encoder) throws {\n    var container = encoder.container(keyedBy: CodingKeys.self)\n${properties.map(({ key, required }) => `    try container.${required ? "encode" : "encodeIfPresent"}(${key}, forKey: .${key})`).join("\n")}\n  }\n`
      : "";
    swift += `public struct ${name}: Codable, Sendable {\n${properties.map((property) => `  public let \`${property.key}\`: ${swiftFieldType(property)}`).join("\n")}\n  public init(${properties.map(({ key, value, optional }) => `${key}: ${fieldType(value, `${name}${pascal(key)}`)}${optional ? "? = nil" : ""}`).join(", ")}) {\n${properties.map(({ key }) => `    self.${key} = ${key}`).join("\n")}\n  }\n${swiftCodable}}\n\n`;
    kotlin += `@Serializable\ndata class ${name}(\n${properties.map(({ key, value, optional, requiredNullable }) => `${requiredNullable ? "  @Required\n" : ""}  val \`${key}\`: ${fieldType(value, `${name}${pascal(key)}`, "kotlin")}${optional ? "? = null" : ""}`).join(",\n")}\n)\n\n`;
  }
}
swift += `public struct CreatorAPIError: Error, Sendable { public let status: Int; public let body: Data }
public struct CreatorAPIBinaryResponse: Sendable {
  public let body: Data
  public let status: Int
  public let contentType: String?
  public let contentRange: String?
  public let acceptRanges: String?
}

private final class CreatorAPIRedirectGuard: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) { completionHandler(nil) }
}

public actor CreatorAPIClient {
  private let baseURL: URL
  private let session: URLSession
  private let token: @Sendable () async throws -> String?
  private let maximumResponseBytes: Int
  private let timeoutSeconds: TimeInterval
  private let expectedAccountId: String?
  private let expectedSessionId: String?
  public init(baseURL: URL, session: URLSession = .shared, maximumResponseBytes: Int = 268_435_456, timeoutSeconds: TimeInterval = 30, expectedAccountId: String? = nil, expectedSessionId: String? = nil, token: @escaping @Sendable () async throws -> String?) {
    self.baseURL = baseURL; self.session = session; self.maximumResponseBytes = maximumResponseBytes; self.timeoutSeconds = timeoutSeconds; self.expectedAccountId = expectedAccountId; self.expectedSessionId = expectedSessionId; self.token = token
  }
  /// W8 private transport through this original client; pins only refuse a
  /// changed genuine session. Public help uses the separate anonymous path.
  public func trustBytes(_ path: String, expectedAccountId: String, expectedSessionId: String, body: Data? = nil, binary: Bool = false) async throws -> CreatorAPIBinaryResponse {
    guard path.range(of: #"^/v1/trust/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*$"#, options: .regularExpression) != nil,
          !expectedAccountId.isEmpty, !expectedSessionId.isEmpty, (body?.count ?? 0) <= 1_048_576 else { throw URLError(.badURL) }
    return try await requestBytes(path, method: body == nil ? "GET" : "POST", body: body, authenticated: true,
      headers: ["X-Expected-Account-Id": expectedAccountId, "X-Expected-Session-Id": expectedSessionId],
      accept: binary ? "application/octet-stream" : "application/json", contentType: "application/json")
  }
  /// W4 JSON transport retains the original client and denial-only session pins.
  public func commerceBytes(_ path: String, expectedAccountId: String, expectedSessionId: String, body: Data? = nil) async throws -> CreatorAPIBinaryResponse {
    guard path.range(of: #"^/v1/commerce/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*$"#, options: .regularExpression) != nil,
          !expectedAccountId.isEmpty, !expectedSessionId.isEmpty, (body?.count ?? 0) <= 1_048_576 else { throw URLError(.badURL) }
    return try await requestBytes(path, method: body == nil ? "GET" : "POST", body: body, authenticated: true,
      headers: ["X-Expected-Account-Id": expectedAccountId, "X-Expected-Session-Id": expectedSessionId, "x-commerce-account-id": expectedAccountId],
      accept: "application/json", contentType: "application/json")
  }
  /// W5 JSON transport retains the original client and denial-only session pins.
  public func contentBytes(_ path: String, expectedAccountId: String, expectedSessionId: String, body: Data? = nil, query: [URLQueryItem] = []) async throws -> CreatorAPIBinaryResponse {
    guard path.range(of: #"^/v1/content/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*$"#, options: .regularExpression) != nil,
          !expectedAccountId.isEmpty, !expectedSessionId.isEmpty, (body?.count ?? 0) <= 1_048_576,
          query.count <= 4, Set(query.map(\\.name)).count == query.count,
          query.allSatisfy({ ["contentId", "cursor", "targetKind", "targetId"].contains($0.name) && ($0.value?.utf8.count ?? 0) <= 1024 }) else { throw URLError(.badURL) }
    return try await requestBytes(path, method: body == nil ? "GET" : "POST", body: body, authenticated: true, query: query,
      headers: ["X-Expected-Account-Id": expectedAccountId, "X-Expected-Session-Id": expectedSessionId],
      accept: "application/json", contentType: "application/json")
  }
  private func request<Response: Decodable & Sendable>(_ path: String, method: String, body: Data? = nil, authenticated: Bool, query: [URLQueryItem] = [], headers: [String: String] = [:], contentType: String = "application/json") async throws -> Response {
    let response = try await requestBytes(path, method: method, body: body, authenticated: authenticated, query: query, headers: headers, accept: "application/json", contentType: contentType)
    return try JSONDecoder().decode(Response.self, from: response.body)
  }
  private func requestBytes(_ path: String, method: String, body: Data? = nil, authenticated: Bool, query: [URLQueryItem] = [], headers: [String: String] = [:], accept: String = "application/octet-stream", contentType: String = "application/octet-stream") async throws -> CreatorAPIBinaryResponse {
    try Task.checkCancellation()
    guard (1...268_435_456).contains(maximumResponseBytes), timeoutSeconds > 0, timeoutSeconds <= 30 else { throw URLError(.badURL) }
    guard var url = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else { throw URLError(.badURL) }
    url.percentEncodedPath = path
    if !query.isEmpty {
      let encodedQuery = query.compactMap { item in item.value.map { segment(item.name) + "=" + segment($0) } }.joined(separator: "&")
      url.percentEncodedQuery = encodedQuery.isEmpty ? nil : encodedQuery
    }
    guard let target = url.url else { throw URLError(.badURL) }
    var request = URLRequest(url: target)
    request.httpMethod = method; request.httpBody = body; request.timeoutInterval = timeoutSeconds
    request.setValue(accept, forHTTPHeaderField: "Accept")
    if body != nil { request.setValue(contentType, forHTTPHeaderField: "Content-Type") }
    for (name, value) in headers { request.setValue(value, forHTTPHeaderField: name) }
    // Genuine capture pins only refuse a changed request; credentials remain
    // the server's actual authority. Uncaptured canonical reads have no pins.
    if authenticated {
      if let expectedAccountId { request.setValue(expectedAccountId, forHTTPHeaderField: "X-Expected-Account-Id") }
      if let expectedSessionId { request.setValue(expectedSessionId, forHTTPHeaderField: "X-Expected-Session-Id") }
    }
    if authenticated, let value = try await token() { request.setValue("Bearer \\(value)", forHTTPHeaderField: "Authorization") }
    try Task.checkCancellation()
    let (bytes, response) = try await session.bytes(for: request, delegate: CreatorAPIRedirectGuard())
    guard let response = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
    let maximum = (200..<300).contains(response.statusCode) ? maximumResponseBytes : min(maximumResponseBytes, 8192)
    if response.expectedContentLength > Int64(maximum) { throw URLError(.dataLengthExceedsMaximum) }
    var data = Data()
    for try await byte in bytes {
      try Task.checkCancellation()
      guard data.count < maximum else { throw URLError(.dataLengthExceedsMaximum) }
      data.append(byte)
    }
    try Task.checkCancellation()
    guard (200..<300).contains(response.statusCode) else { throw CreatorAPIError(status: response.statusCode, body: data) }
    return CreatorAPIBinaryResponse(body: data, status: response.statusCode, contentType: response.value(forHTTPHeaderField: "Content-Type"), contentRange: response.value(forHTTPHeaderField: "Content-Range"), acceptRanges: response.value(forHTTPHeaderField: "Accept-Ranges"))
  }
  private func segment(_ value: String) -> String { value.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "" }
`;
kotlin += `class CreatorAPIError(val status: Int, val body: String): Exception("API request refused ($status)")
data class CreatorAPIBinaryResponse(val body: ByteArray, val status: Int, val contentType: String?, val contentRange: String?, val acceptRanges: String?)

// Existing app dependency; share connection/thread pools across captured clients.
private object CreatorAPITransport {
  val client = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false).build()
}

class CreatorAPIClient(private val baseURL: String, private val maximumResponseBytes: Int = 268_435_456, private val timeoutMs: Int = 30_000, private val expectedAccountId: String? = null, private val expectedSessionId: String? = null, private val token: suspend () -> String?) {
  // Debug builds stay strict so contract drift fails in development and connected tests.
  // Release builds ignore unknown keys so an additive server field cannot break an installed app.
  private val json = Json { ignoreUnknownKeys = !com.pantopus.qelvora.BuildConfig.DEBUG }
  /** W8 private transport on this original client, with denial-only pins. */
  suspend fun trustBytes(path: String, expectedAccountId: String, expectedSessionId: String, body: ByteArray? = null, binary: Boolean = false): CreatorAPIBinaryResponse {
    require(path.matches(Regex("^/v1/trust/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*$")) && expectedAccountId.isNotEmpty() && expectedSessionId.isNotEmpty() && (body?.size ?: 0) <= 1_048_576)
    return requestBytes(path, if (body == null) "GET" else "POST", body, authenticated = true,
      headers = mapOf("X-Expected-Account-Id" to expectedAccountId, "X-Expected-Session-Id" to expectedSessionId),
      accept = if (binary) "application/octet-stream" else "application/json", contentType = "application/json")
  }
  /** W4 JSON transport on this original client, with denial-only session pins. */
  suspend fun commerceBytes(path: String, expectedAccountId: String, expectedSessionId: String, body: ByteArray? = null): CreatorAPIBinaryResponse {
    require(path.matches(Regex("^/v1/commerce/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*$")) && expectedAccountId.isNotEmpty() && expectedSessionId.isNotEmpty() && (body?.size ?: 0) <= 1_048_576)
    return requestBytes(path, if (body == null) "GET" else "POST", body, authenticated = true,
      headers = mapOf("X-Expected-Account-Id" to expectedAccountId, "X-Expected-Session-Id" to expectedSessionId, "x-commerce-account-id" to expectedAccountId),
      accept = "application/json", contentType = "application/json")
  }
  /** W5 JSON transport on this original client, with denial-only session pins. */
  suspend fun contentBytes(path: String, expectedAccountId: String, expectedSessionId: String, body: ByteArray? = null, query: List<Pair<String, String?>> = emptyList()): CreatorAPIBinaryResponse {
    require(path.matches(Regex("^/v1/content/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*$")) && expectedAccountId.isNotEmpty() && expectedSessionId.isNotEmpty() && (body?.size ?: 0) <= 1_048_576 && query.size <= 4 && query.map { it.first }.toSet().size == query.size && query.all { it.first in setOf("contentId", "cursor", "targetKind", "targetId") && (it.second?.toByteArray(Charsets.UTF_8)?.size ?: 0) <= 1024 })
    return requestBytes(path, if (body == null) "GET" else "POST", body, authenticated = true, query = query,
      headers = mapOf("X-Expected-Account-Id" to expectedAccountId, "X-Expected-Session-Id" to expectedSessionId),
      accept = "application/json", contentType = "application/json")
  }
  private suspend fun request(path: String, method: String, body: String? = null, authenticated: Boolean, query: List<Pair<String, String?>> = emptyList(), headers: Map<String, String> = emptyMap()): String =
    requestBytes(path, method, body?.toByteArray(Charsets.UTF_8), authenticated, query, headers, "application/json", "application/json").body.toString(Charsets.UTF_8)
  private suspend fun requestBytes(path: String, method: String, body: ByteArray? = null, authenticated: Boolean, query: List<Pair<String, String?>> = emptyList(), headers: Map<String, String> = emptyMap(), accept: String = "application/octet-stream", contentType: String = "application/octet-stream"): CreatorAPIBinaryResponse {
    require(maximumResponseBytes in 1..268_435_456 && timeoutMs in 1..30_000)
    // One original budget includes token loading, dispatch and the complete body.
    // Cancellation closes this exact Call; a coroutine timer alone cannot stop blocking reads.
    return try { withTimeout(timeoutMs.toLong()) {
      val request = withContext(Dispatchers.IO) {
        kotlinx.coroutines.currentCoroutineContext().ensureActive()
        val encodedQuery = query.filter { it.second != null }.joinToString("&") { segment(it.first) + "=" + segment(it.second!!) }
        val builder = Request.Builder().url(baseURL.trimEnd('/') + path + (if (encodedQuery.isEmpty()) "" else "?" + encodedQuery)).header("Accept", accept)
        headers.forEach { (name, value) -> builder.header(name, value) }
        // Captured original pins are denial preconditions, never identity.
        if (authenticated) {
          expectedAccountId?.let { builder.header("X-Expected-Account-Id", it) }
          expectedSessionId?.let { builder.header("X-Expected-Session-Id", it) }
          token()?.let { builder.header("Authorization", "Bearer $it") }
        }
        val requestBody = body?.toRequestBody(contentType.toMediaType())
          ?: if (method in setOf("POST", "PUT", "PATCH", "PROPPATCH", "REPORT")) byteArrayOf().toRequestBody(null) else null
        kotlinx.coroutines.currentCoroutineContext().ensureActive()
        builder.method(method, requestBody).build()
      }
      val call = CreatorAPITransport.client.newBuilder()
        .connectTimeout(minOf(15000, timeoutMs).toLong(), TimeUnit.MILLISECONDS)
        .readTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
        .writeTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
        .callTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
        .build().newCall(request)
      suspendCancellableCoroutine { continuation ->
        continuation.invokeOnCancellation { call.cancel() }
        call.enqueue(object : Callback {
          override fun onFailure(call: Call, error: IOException) { continuation.resumeWith(Result.failure(error)) }
          override fun onResponse(call: Call, response: Response) {
            try {
              val result = response.use {
                val status = response.code
                val maximum = if (status in 200..299) maximumResponseBytes else minOf(maximumResponseBytes, 8192)
                check((response.body?.contentLength() ?: -1) <= maximum.toLong())
                val payload = response.body?.byteStream()?.use { stream ->
                  val output = java.io.ByteArrayOutputStream()
                  val buffer = ByteArray(8192)
                  while (true) {
                    if (!continuation.isActive) throw java.io.InterruptedIOException("API request cancelled")
                    val count = stream.read(buffer); if (count < 0) break
                    check(output.size() + count <= maximum); output.write(buffer, 0, count)
                  }
                  output.toByteArray()
                } ?: byteArrayOf()
                if (!continuation.isActive) throw java.io.InterruptedIOException("API request cancelled")
                if (status !in 200..299) throw CreatorAPIError(status, payload.toString(Charsets.UTF_8))
                CreatorAPIBinaryResponse(payload, status, response.header("Content-Type"), response.header("Content-Range"), response.header("Accept-Ranges"))
              }
              continuation.resumeWith(Result.success(result))
            } catch (error: Exception) { continuation.resumeWith(Result.failure(error)) }
          }
        })
      }
    } } catch (expired: kotlinx.coroutines.TimeoutCancellationException) {
      // A genuine parent cancellation must keep its original cancellation meaning.
      kotlinx.coroutines.currentCoroutineContext().ensureActive()
      throw java.net.SocketTimeoutException("API request timed out").apply { initCause(expired) }
    }
  }
  private fun segment(value: String): String = URLEncoder.encode(value, "UTF-8").replace("+", "%20")
`;
const binarySchema = (content) => {
  const schema = content?.["application/octet-stream"]?.schema;
  return schema?.type === "string" && schema.format === "binary";
};
const jsonReference = (content) => {
  const ref = content?.["application/json"]?.schema?.$ref;
  return ref?.startsWith("#/components/schemas/") ? ref.split("/").pop() : null;
};
const parameterName = (name) => {
  const value = pascal(name);
  return value[0].toLowerCase() + value.slice(1);
};
for (const { route, method, operation, parameters } of operations) {
  const successes = Object.entries(operation.responses)
    .filter(([status]) => /^2[0-9]{2}$/u.test(status))
    .map(([, response]) => response.content);
  const binaryResponse = successes.length > 0 && successes.every(binarySchema);
  const response = jsonReference(successes[0]);
  if (
    !binaryResponse &&
    (!response ||
      successes.some((content) => jsonReference(content) !== response))
  )
    throw new Error(
      `Unsupported success response for ${operation.operationId}`,
    );
  const bodyContent = operation.requestBody?.content;
  const body = jsonReference(bodyContent);
  const binaryBody = binarySchema(bodyContent);
  if (bodyContent && !body && !binaryBody)
    throw new Error(`Unsupported request body for ${operation.operationId}`);
  const requiredAuth = (operation.security ?? []).length > 0;
  const fields = parameters.map((parameter) => {
    if (
      !["path", "query", "header"].includes(parameter.in) ||
      !["string", "integer", "number", "boolean"].includes(
        parameter.schema?.type,
      ) ||
      (parameter.in === "path" &&
        (!parameter.required || parameter.schema.type !== "string")) ||
      (parameter.in === "header" &&
        ["authorization", "host", "cookie", "content-type", "accept"].includes(
          parameter.name.toLowerCase(),
        ))
    )
      throw new Error(`Unsupported parameter for ${operation.operationId}`);
    return {
      ...parameter,
      argument:
        parameter.in === "path"
          ? parameter.name
          : parameterName(parameter.name),
    };
  });
  const names = [
    operation.operationId,
    ...fields.map((field) => field.argument),
  ];
  if (
    names.some((name) => !/^[a-zA-Z_][a-zA-Z0-9_]*$/u.test(name)) ||
    new Set(fields.map((field) => field.argument)).size !== fields.length ||
    fields.some((field) => field.argument === "body")
  )
    throw new Error(
      `Invalid native operation signature for ${operation.operationId}`,
    );
  const pathFields = fields.filter((field) => field.in === "path");
  const routeFields = [...route.matchAll(/\{([^}]+)\}/gu)].map(
    (match) => match[1],
  );
  if (
    routeFields.some(
      (name) => !pathFields.some((field) => field.name === name),
    ) ||
    pathFields.some((field) => !routeFields.includes(field.name))
  )
    throw new Error(
      `Missing native path parameter for ${operation.operationId}`,
    );
  const parameterType = (field, language) =>
    fieldType(
      field.schema,
      `${pascal(operation.operationId)}${pascal(field.name)}`,
      language,
    );
  const stringValue = (field, language) => {
    if (field.schema.enum) {
      if (language === "swift")
        return `${field.argument}${field.required ? "." : "?."}rawValue`;
      const wire = (value) =>
        `json.decodeFromString<String>(json.encodeToString(${value}))`;
      return field.required
        ? wire(field.argument)
        : `${field.argument}?.let { ${wire("it")} }`;
    }
    if (field.schema.type === "string") return field.argument;
    if (language === "swift")
      return field.required
        ? `String(${field.argument})`
        : `${field.argument}.map { String($0) }`;
    return field.required
      ? `${field.argument}.toString()`
      : `${field.argument}?.toString()`;
  };
  const swiftPath = route.replace(
    /\{([^}]+)\}/g,
    (_, key) =>
      `\\(segment(${stringValue(
        pathFields.find((field) => field.name === key),
        "swift",
      )}))`,
  );
  const kotlinPath = route.replace(
    /\{([^}]+)\}/g,
    (_, key) =>
      `\x24{segment(${stringValue(
        pathFields.find((field) => field.name === key),
        "kotlin",
      )})}`,
  );
  const query = fields.filter((field) => field.in === "query");
  const headers = fields.filter((field) => field.in === "header");
  const swiftExtras =
    (query.length
      ? `, query: [${query.map((field) => `URLQueryItem(name: ${JSON.stringify(field.name)}, value: ${stringValue(field, "swift")})`).join(", ")}]`
      : "") +
    (headers.length
      ? `, headers: [${headers.map((field) => `${JSON.stringify(field.name)}: ${stringValue(field, "swift")}`).join(", ")}].compactMapValues { $0 }`
      : "") +
    (binaryBody && !binaryResponse
      ? ', contentType: "application/octet-stream"'
      : "") +
    (body && binaryResponse ? ', contentType: "application/json"' : "");
  const kotlinExtras =
    (query.length
      ? `, query = listOf(${query.map((field) => `${JSON.stringify(field.name)} to ${stringValue(field, "kotlin")}`).join(", ")})`
      : "") +
    (headers.length
      ? `, headers = listOf(${headers.map((field) => `${JSON.stringify(field.name)} to ${stringValue(field, "kotlin")}`).join(", ")}).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()`
      : "") +
    (binaryBody && !binaryResponse ? ', accept = "application/json"' : "") +
    (body && binaryResponse ? ', contentType = "application/json"' : "");
  const swiftArgs = [
    ...fields.map(
      (field) =>
        `${field.argument}: ${parameterType(field, "swift")}${field.required ? "" : "? = nil"}`,
    ),
    ...(body ? [`body: ${modelName(body)}`] : binaryBody ? ["body: Data"] : []),
  ].join(", ");
  const kotlinArgs = [
    ...fields.map(
      (field) =>
        `${field.argument}: ${parameterType(field, "kotlin")}${field.required ? "" : "? = null"}`,
    ),
    ...(body
      ? [`body: ${modelName(body)}`]
      : binaryBody
        ? ["body: ByteArray"]
        : []),
  ].join(", ");
  swift += `  public func ${operation.operationId}(${swiftArgs}) async throws -> ${binaryResponse ? "CreatorAPIBinaryResponse" : modelName(response)} {\n    try await ${binaryResponse ? "requestBytes" : "request"}("${swiftPath}", method: "${method.toUpperCase()}"${body ? ", body: JSONEncoder().encode(body)" : binaryBody ? ", body: body" : ""}, authenticated: ${requiredAuth}${swiftExtras})\n  }\n`;
  const rawKotlin = binaryResponse || binaryBody;
  const kotlinRequest = `${rawKotlin ? "requestBytes" : "request"}("${kotlinPath}", "${method.toUpperCase()}"${body ? `, body = json.encodeToString(body)${rawKotlin ? ".toByteArray(Charsets.UTF_8)" : ""}` : binaryBody ? ", body = body" : ""}, authenticated = ${requiredAuth}${kotlinExtras})`;
  kotlin += `  suspend fun ${operation.operationId}(${kotlinArgs}): ${binaryResponse ? "CreatorAPIBinaryResponse" : modelName(response)} = ${binaryResponse ? kotlinRequest : `json.decodeFromString(${kotlinRequest}${binaryBody ? ".body.toString(Charsets.UTF_8)" : ""})`}\n`;
}
swift += "}\n";
kotlin += "}\n";
const swiftQueryScopes = Object.entries(navigation.queryParameters)
  .map(([key, pattern]) => `${JSON.stringify(key)}: ${JSON.stringify(pattern)}`)
  .join(", ");
const kotlinQueryScopes = Object.entries(navigation.queryParameters)
  .map(
    ([key, pattern]) => `${JSON.stringify(key)} to ${JSON.stringify(pattern)}`,
  )
  .join(", ");
const swiftLiteralQueryValues = Object.entries(navigation.literalQueryValues)
  .map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`)
  .join(", ");
const kotlinLiteralQueryValues = Object.entries(navigation.literalQueryValues)
  .map(([key, value]) => `${JSON.stringify(key)} to ${JSON.stringify(value)}`)
  .join(", ");
swift += `
public enum ApplicationDestination {
  public static func requiresFanProfile(_ value: String) -> Bool {
    !isPermitted(value) || value.components(separatedBy: "?")[0].range(of: ${JSON.stringify(navigation.fanHandleExemptPathPattern)}, options: .regularExpression) == nil
  }
  public static func isPermitted(_ value: String) -> Bool {
    if value.count > 2048 || value.contains("%") || value.contains("\\\\") || value.contains("#") || value.rangeOfCharacter(from: .whitespacesAndNewlines) != nil { return false }
    let parts = value.components(separatedBy: "?")
    guard parts.count <= 2, parts[0].range(of: ${JSON.stringify(navigation.pathPattern)}, options: .regularExpression) != nil else { return false }
    if parts.count == 1 { return true }
    let scopes = [${swiftQueryScopes}]
    let literalValues = [${swiftLiteralQueryValues}]
    let fields = parts[1].components(separatedBy: "&")
    guard fields.count <= 2 else { return false }
    var names = Set<String>()
    for field in fields {
      let pair = field.components(separatedBy: "=")
      guard pair.count == 2, names.insert(pair[0]).inserted, let scope = scopes[pair[0]], parts[0].range(of: scope, options: .regularExpression) != nil else { return false }
      if let expected = literalValues[pair[0]] {
        guard pair[1] == expected else { return false }
      } else {
        guard let id = UUID(uuidString: pair[1]), id.uuidString.lowercased() == pair[1] else { return false }
      }
    }
    return true
  }
}
`;
kotlin += `
object ApplicationDestination {
  fun requiresFanProfile(value: String): Boolean = !isPermitted(value) || !Regex(${JSON.stringify(navigation.fanHandleExemptPathPattern)}).matches(value.substringBefore('?'))
  fun isPermitted(value: String): Boolean {
    if (value.length > 2048 || value.contains('%') || value.contains('\\\\') || value.contains('#') || value.any { it.isWhitespace() }) return false
    val parts = value.split('?')
    if (parts.size > 2 || !Regex(${JSON.stringify(navigation.pathPattern)}).matches(parts[0])) return false
    if (parts.size == 1) return true
    val scopes = mapOf(${kotlinQueryScopes})
    val literalValues = mapOf(${kotlinLiteralQueryValues})
    val fields = parts[1].split('&')
    if (fields.size > 2) return false
    val names = mutableSetOf<String>()
    return fields.all { field ->
      val pair = field.split('=')
      pair.size == 2 && names.add(pair[0]) && scopes[pair[0]]?.let { Regex(it).containsMatchIn(parts[0]) } == true && (literalValues[pair[0]]?.let { pair[1] == it } ?: runCatching { java.util.UUID.fromString(pair[1]).toString() == pair[1] }.getOrDefault(false))
    }
  }
}
`;
const outputs = new Map([
  ["apps/ios/Sources/Generated/QelvoraAPI.swift", swift],
  [
    "apps/android/app/src/main/java/com/pantopus/qelvora/generated/QelvoraAPI.kt",
    kotlin,
  ],
]);
for (const [relative, content] of outputs) {
  const destination = path.join(root, relative);
  if (check) {
    if (
      !fs.existsSync(destination) ||
      fs.readFileSync(destination, "utf8") !== content
    ) {
      console.error(`Generated file is stale: ${relative}`);
      process.exitCode = 1;
    }
  } else if (
    !fs.existsSync(destination) ||
    fs.readFileSync(destination, "utf8") !== content
  ) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
  }
}
console.log(
  `${check ? "Verified" : "Generated"} Swift/Kotlin API models and ${operations.length} operations from OpenAPI.`,
);
