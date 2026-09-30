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
  const value = concrete(schema);
  if (value !== schema) {
    models.set(name, { kind: "alias", schema });
    register(`${name}Value`, value);
    return;
  }
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
let swift =
  "// Generated from packages/api/generated/openapi.json. Do not edit.\nimport Foundation\n\n";
let kotlin =
  "// Generated from packages/api/generated/openapi.json. Do not edit.\npackage com.pantopus.qelvora.generated\n\nimport kotlinx.serialization.Serializable\nimport kotlinx.serialization.SerialName\nimport kotlinx.serialization.KSerializer\nimport kotlinx.serialization.SerializationException\nimport kotlinx.serialization.descriptors.PrimitiveKind\nimport kotlinx.serialization.descriptors.PrimitiveSerialDescriptor\nimport kotlinx.serialization.encoding.Decoder\nimport kotlinx.serialization.encoding.Encoder\nimport kotlinx.serialization.encodeToString\nimport kotlinx.serialization.decodeFromString\nimport kotlinx.serialization.json.Json\nimport kotlinx.serialization.json.JsonElement\nimport kotlinx.coroutines.Dispatchers\nimport kotlinx.coroutines.withContext\nimport java.net.HttpURLConnection\nimport java.net.URL\nimport java.net.URLEncoder\n\n";
swift += `public enum APIJSONValue: Codable, Sendable {\n  case string(String), number(Double), boolean(Bool), array([APIJSONValue]), object([String: APIJSONValue]), null\n  public init(from decoder: Decoder) throws {\n    let container = try decoder.singleValueContainer()\n    if container.decodeNil() { self = .null }\n    else if let value = try? container.decode(Bool.self) { self = .boolean(value) }\n    else if let value = try? container.decode(Double.self) { self = .number(value) }\n    else if let value = try? container.decode(String.self) { self = .string(value) }\n    else if let value = try? container.decode([APIJSONValue].self) { self = .array(value) }\n    else { self = .object(try container.decode([String: APIJSONValue].self)) }\n  }\n  public func encode(to encoder: Encoder) throws {\n    var container = encoder.singleValueContainer()\n    switch self {\n      case .string(let value): try container.encode(value)\n      case .number(let value): try container.encode(value)\n      case .boolean(let value): try container.encode(value)\n      case .array(let value): try container.encode(value)\n      case .object(let value): try container.encode(value)\n      case .null: try container.encodeNil()\n    }\n  }\n}\n\n`;
for (const [name, { kind, schema }] of models) {
  if (kind === "alias") {
    const value = concrete(schema);
    const swiftType =
      value !== schema ? `${name}Value?` : fieldType(value, `${name}Value`);
    const kotlinType =
      value !== schema
        ? `${name}Value?`
        : fieldType(value, `${name}Value`, "kotlin");
    swift += `public typealias ${name} = ${swiftType}\n\n`;
    kotlin += `typealias ${name} = ${kotlinType}\n\n`;
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
        optional: !schema.required?.includes(key) || nullable(value),
      }),
    );
    swift += `public struct ${name}: Codable, Sendable {\n${properties.map(({ key, value, optional }) => `  public let \`${key}\`: ${fieldType(value, `${name}${pascal(key)}`)}${optional ? "?" : ""}`).join("\n")}\n  public init(${properties.map(({ key, value, optional }) => `${key}: ${fieldType(value, `${name}${pascal(key)}`)}${optional ? "? = nil" : ""}`).join(", ")}) {\n${properties.map(({ key }) => `    self.${key} = ${key}`).join("\n")}\n  }\n}\n\n`;
    kotlin += `@Serializable\ndata class ${name}(\n${properties.map(({ key, value, optional }) => `  val \`${key}\`: ${fieldType(value, `${name}${pascal(key)}`, "kotlin")}${optional ? "? = null" : ""}`).join(",\n")}\n)\n\n`;
  }
}
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
swift += `public struct CreatorAPIError: Error, Sendable { public let status: Int; public let body: Data }\n\npublic actor CreatorAPIClient {\n  private let baseURL: URL\n  private let session: URLSession\n  private let token: @Sendable () async throws -> String?\n  public init(baseURL: URL, session: URLSession = .shared, token: @escaping @Sendable () async throws -> String?) { self.baseURL = baseURL; self.session = session; self.token = token }\n  private func request<Response: Decodable & Sendable>(_ path: String, method: String, body: Data? = nil, query: [String: String] = [:], expectedAccount: String? = nil, authenticated: Bool) async throws -> Response {\n    guard var url = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else { throw URLError(.badURL) }\n    url.percentEncodedPath = path\n    url.queryItems = query.isEmpty ? nil : query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }\n    var request = URLRequest(url: url.url!)\n    request.httpMethod = method; request.httpBody = body\n    if let expectedAccount { request.setValue(expectedAccount, forHTTPHeaderField: "x-qelvora-expected-account") }\n    request.setValue("application/json", forHTTPHeaderField: "Accept")\n    if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }\n    if authenticated, let value = try await token() { request.setValue("Bearer \\(value)", forHTTPHeaderField: "Authorization") }\n    let (data, response) = try await session.data(for: request)\n    guard let response = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }\n    guard (200..<300).contains(response.statusCode) else { throw CreatorAPIError(status: response.statusCode, body: data) }\n    return try JSONDecoder().decode(Response.self, from: data)\n  }\n  private func segment(_ value: String) -> String { value.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "" }\n`;
kotlin += `class CreatorAPIError(val status: Int, val body: String): Exception("API request refused ($status)")\n\nclass CreatorAPIClient(private val baseURL: String, private val token: suspend () -> String?) {\n  private val json = Json { ignoreUnknownKeys = false }\n  private suspend fun request(path: String, method: String, body: String? = null, query: Map<String, String> = emptyMap(), expectedAccount: String? = null, authenticated: Boolean): String = withContext(Dispatchers.IO) {\n    val connection = URL(baseURL.trimEnd('/') + path + if (query.isEmpty()) "" else query.toSortedMap().entries.joinToString(prefix = "?", separator = "&") { segment(it.key) + "=" + segment(it.value) }).openConnection() as HttpURLConnection\n    try {\n      connection.requestMethod = method\n      connection.connectTimeout = 15000; connection.readTimeout = 30000\n      connection.setRequestProperty("Accept", "application/json")\n      expectedAccount?.let { connection.setRequestProperty("x-qelvora-expected-account", it) }\n      if (authenticated) token()?.let { connection.setRequestProperty("Authorization", "Bearer $it") }\n      if (body != null) { connection.doOutput = true; connection.setRequestProperty("Content-Type", "application/json"); connection.outputStream.bufferedWriter().use { it.write(body) } }\n      val status = connection.responseCode\n      val payload = (if (status in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""\n      if (status !in 200..299) throw CreatorAPIError(status, payload)\n      payload\n    } finally { connection.disconnect() }\n  }\n  private fun segment(value: String): String = URLEncoder.encode(value, "UTF-8").replace("+", "%20")\n`;
for (const { route, method, operation, parameters } of operations) {
  const response = operation.responses["200"]?.content?.[
    "application/json"
  ]?.schema?.$ref
    ?.split("/")
    .pop();
  const body = operation.requestBody?.content?.[
    "application/json"
  ]?.schema?.$ref
    ?.split("/")
    .pop();
  if (!response)
    throw new Error(
      `Unsupported success response for ${operation.operationId}`,
    );
  const requiredAuth = (operation.security ?? []).length > 0;
  const params = parameters
    .filter((parameter) => parameter.in === "path")
    .map((parameter) => parameter.name);
  const swiftPath = route.replace(
    /\{([^}]+)\}/g,
    (_, key) => `\\(segment(${key}))`,
  );
  const kotlinPath = route.replace(
    /\{([^}]+)\}/g,
    (_, key) => `\x24{segment(${key})}`,
  );
  const hasQuery = parameters.some((parameter) => parameter.in === "query");
  const hasAccount = parameters.some(
    (parameter) =>
      parameter.in === "header" &&
      parameter.name === "x-qelvora-expected-account",
  );
  swift += `  public func ${operation.operationId}(${[...params.map((key) => `${key}: String`), ...(body ? [`body: ${modelName(body)}`] : []), ...(hasQuery ? ["query: [String: String] = [:]"] : []), ...(hasAccount ? ["expectedAccount: String? = nil"] : [])].join(", ")}) async throws -> ${modelName(response)} {\n    try await request("${swiftPath}", method: "${method.toUpperCase()}"${body ? ", body: JSONEncoder().encode(body)" : ""}${hasQuery ? ", query: query" : ""}${hasAccount ? ", expectedAccount: expectedAccount" : ""}, authenticated: ${requiredAuth})\n  }\n`;
  kotlin += `  suspend fun ${operation.operationId}(${[...params.map((key) => `${key}: String`), ...(body ? [`body: ${modelName(body)}`] : []), ...(hasQuery ? ["query: Map<String, String> = emptyMap()"] : []), ...(hasAccount ? ["expectedAccount: String? = null"] : [])].join(", ")}): ${modelName(response)} = json.decodeFromString(request("${kotlinPath}", "${method.toUpperCase()}"${body ? ", body = json.encodeToString(body)" : ""}${hasQuery ? ", query = query" : ""}${hasAccount ? ", expectedAccount = expectedAccount" : ""}, authenticated = ${requiredAuth}))\n`;
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
  } else {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
  }
}
console.log(
  `${check ? "Verified" : "Generated"} Swift/Kotlin API models and ${operations.length} operations from OpenAPI.`,
);
