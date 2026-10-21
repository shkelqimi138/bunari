// Expo native module exposing scrypt key derivation to JavaScript
import ExpoModulesCore

public class BunariScryptModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BunariScrypt")

    // Runs off the JavaScript thread. The password is UTF-8 text, the salt and the
    // result are hex, matching src/security/private-crypto.ts.
    AsyncFunction("scrypt") { (password: String, saltHex: String, n: Int, r: Int, p: Int, dkLen: Int) throws -> String in
      guard let salt = bytes(fromHex: saltHex) else { throw ScryptError.invalidParameters }
      let key = try Scrypt.derive(password: Array(password.utf8), salt: salt, n: n, r: r, p: p, dkLen: dkLen)
      return key.map { String(format: "%02x", $0) }.joined()
    }
  }
}

private func bytes(fromHex hex: String) -> [UInt8]? {
  let characters = Array(hex.utf8)
  guard characters.count % 2 == 0 else { return nil }
  var result = [UInt8]()
  result.reserveCapacity(characters.count / 2)
  var index = 0
  while index < characters.count {
    guard let high = nibble(characters[index]), let low = nibble(characters[index + 1]) else { return nil }
    result.append(high << 4 | low)
    index += 2
  }
  return result
}

private func nibble(_ character: UInt8) -> UInt8? {
  switch character {
  case 48...57: return character - 48
  case 65...70: return character - 55
  case 97...102: return character - 87
  default: return nil
  }
}
