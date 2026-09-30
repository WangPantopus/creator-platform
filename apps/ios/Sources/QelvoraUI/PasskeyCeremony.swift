#if os(iOS)
import AuthenticationServices
import UIKit
import Foundation

public enum NativeSigningError: Error { case unavailable, cancelled, invalidResponse }

/// AuthenticationServices performs user verification; the backend alone decides authority.
@MainActor
public final class PasskeyCeremony: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private var continuation: CheckedContinuation<APIJSONValue, Error>?
    private var controller: ASAuthorizationController?
    private weak var anchor: UIWindow?
    public init(anchor: UIWindow) { self.anchor = anchor }
    private static func decode(_ value: String) throws -> Data {
        var standard = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        standard += String(repeating: "=", count: (4 - standard.count % 4) % 4)
        guard let data = Data(base64Encoded: standard) else { throw NativeSigningError.invalidResponse }
        return data
    }
    private static func encode(_ value: Data) -> String { value.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") }
    public func register(options: APIJSONValue) async throws -> APIJSONValue {
        let object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(options)) as? [String: Any]
        guard let rp = object?["rp"] as? [String: Any], let rpID = rp["id"] as? String, let user = object?["user"] as? [String: Any], let name = user["name"] as? String, let id = user["id"] as? String, let challenge = object?["challenge"] as? String else { throw NativeSigningError.invalidResponse }
        let request = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpID).createCredentialRegistrationRequest(challenge: try Self.decode(challenge), name: name, userID: try Self.decode(id))
        request.userVerificationPreference = .required
        return try await perform(request)
    }
    public func assert(options: APISignedChallengePublicKey) async throws -> APIJSONValue {
        let request = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: options.rpId).createCredentialAssertionRequest(challenge: try Self.decode(options.challenge))
        request.userVerificationPreference = .required
        request.allowedCredentials = try options.allowCredentials.map { ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: try Self.decode($0.id)) }
        return try await perform(request)
    }
    private func perform(_ request: ASAuthorizationRequest) async throws -> APIJSONValue {
        guard continuation == nil, anchor != nil else { throw NativeSigningError.unavailable }
        return try await withCheckedThrowingContinuation { value in
            continuation = value
            let ceremony = ASAuthorizationController(authorizationRequests: [request]); controller = ceremony
            ceremony.delegate = self; ceremony.presentationContextProvider = self; ceremony.performRequests()
        }
    }
    public func cancel() { controller?.cancel(); finish(.failure(NativeSigningError.cancelled)) }
    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor { anchor ?? UIWindow() }
    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        let result: [String: Any]
        if let value = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialRegistration, let attestation = value.rawAttestationObject {
            result = ["id": Self.encode(value.credentialID), "rawId": Self.encode(value.credentialID), "type": "public-key", "response": ["clientDataJSON": Self.encode(value.rawClientDataJSON), "attestationObject": Self.encode(attestation), "transports": ["internal"]], "clientExtensionResults": [:], "authenticatorAttachment": "platform"]
        } else if let value = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion {
            result = ["id": Self.encode(value.credentialID), "rawId": Self.encode(value.credentialID), "type": "public-key", "response": ["clientDataJSON": Self.encode(value.rawClientDataJSON), "authenticatorData": Self.encode(value.rawAuthenticatorData), "signature": Self.encode(value.signature), "userHandle": Self.encode(value.userID)], "clientExtensionResults": [:], "authenticatorAttachment": "platform"]
        } else { finish(.failure(NativeSigningError.invalidResponse)); return }
        do { finish(.success(try JSONDecoder().decode(APIJSONValue.self, from: JSONSerialization.data(withJSONObject: result)))) } catch { finish(.failure(error)) }
    }
    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) { finish(.failure((error as? ASAuthorizationError)?.code == .canceled ? NativeSigningError.cancelled : error)) }
    private func finish(_ result: Result<APIJSONValue, Error>) { let pending = continuation; continuation = nil; controller = nil; pending?.resume(with: result) }
}
#endif
