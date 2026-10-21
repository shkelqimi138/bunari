// Command-line harness for testing the native scrypt against JavaScript and RFC vectors
import Foundation

// Test harness: prints scrypt(password, salt-hex, N, r, p, dkLen) as hex, so the
// native implementation can be compared with @noble/hashes and RFC 7914.
let args = CommandLine.arguments
let salt: [UInt8] = stride(from: 0, to: args[2].count, by: 2).map {
  let start = args[2].index(args[2].startIndex, offsetBy: $0)
  return UInt8(args[2][start..<args[2].index(start, offsetBy: 2)], radix: 16)!
}
let started = Date()
let key = try Scrypt.derive(password: Array(args[1].utf8), salt: salt, n: Int(args[3])!, r: Int(args[4])!, p: Int(args[5])!, dkLen: Int(args[6])!)
FileHandle.standardError.write("\(Int(Date().timeIntervalSince(started) * 1000)) ms\n".data(using: .utf8)!)
print(key.map { String(format: "%02x", $0) }.joined())
