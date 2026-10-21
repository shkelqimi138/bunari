// Native scrypt (RFC 7914) implementation used for Private PIN and recovery-key derivation
import CommonCrypto
import Foundation

enum ScryptError: Error {
  case invalidParameters
  case derivationFailed
}

// scrypt (RFC 7914). It produces the same keys as the JavaScript implementation in
// @noble/hashes, so Private data wrapped by either one opens with the other.
enum Scrypt {
  static func derive(password: [UInt8], salt: [UInt8], n: Int, r: Int, p: Int, dkLen: Int) throws -> [UInt8] {
    guard n > 1, n & (n - 1) == 0, r > 0, p > 0, dkLen > 0, r * p < (1 << 30), n < (1 << 24) else {
      throw ScryptError.invalidParameters
    }
    let blockWords = 32 * r
    var b = try pbkdf2(password: password, salt: salt, length: p * 128 * r)

    let x = UnsafeMutablePointer<UInt32>.allocate(capacity: blockWords)
    let y = UnsafeMutablePointer<UInt32>.allocate(capacity: blockWords)
    let v = UnsafeMutablePointer<UInt32>.allocate(capacity: blockWords * n)
    let t = UnsafeMutablePointer<UInt32>.allocate(capacity: 16)
    defer {
      x.deallocate()
      y.deallocate()
      v.deallocate()
      t.deallocate()
    }

    for block in 0..<p {
      let offset = block * 128 * r
      for word in 0..<blockWords {
        let i = offset + word * 4
        x[word] = UInt32(b[i]) | UInt32(b[i + 1]) << 8 | UInt32(b[i + 2]) << 16 | UInt32(b[i + 3]) << 24
      }
      roMix(x, y: y, v: v, t: t, r: r, n: n)
      for word in 0..<blockWords {
        let i = offset + word * 4
        let value = x[word]
        b[i] = UInt8(truncatingIfNeeded: value)
        b[i + 1] = UInt8(truncatingIfNeeded: value >> 8)
        b[i + 2] = UInt8(truncatingIfNeeded: value >> 16)
        b[i + 3] = UInt8(truncatingIfNeeded: value >> 24)
      }
    }
    // Clear the large working memory before it is released.
    v.initialize(repeating: 0, count: blockWords * n)
    return try pbkdf2(password: password, salt: b, length: dkLen)
  }

  private static func pbkdf2(password: [UInt8], salt: [UInt8], length: Int) throws -> [UInt8] {
    var output = [UInt8](repeating: 0, count: length)
    let status = password.withUnsafeBufferPointer { passwordBuffer in
      salt.withUnsafeBufferPointer { saltBuffer in
        output.withUnsafeMutableBufferPointer { outputBuffer in
          passwordBuffer.baseAddress!.withMemoryRebound(to: Int8.self, capacity: password.count) { passwordPointer in
            CCKeyDerivationPBKDF(
              CCPBKDFAlgorithm(kCCPBKDF2),
              passwordPointer, password.count,
              saltBuffer.baseAddress!, salt.count,
              CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), 1,
              outputBuffer.baseAddress!, length)
          }
        }
      }
    }
    guard status == kCCSuccess else { throw ScryptError.derivationFailed }
    return output
  }

  private static func roMix(_ x: UnsafeMutablePointer<UInt32>, y: UnsafeMutablePointer<UInt32>, v: UnsafeMutablePointer<UInt32>, t: UnsafeMutablePointer<UInt32>, r: Int, n: Int) {
    let blockWords = 32 * r
    for i in 0..<n {
      (v + i * blockWords).update(from: x, count: blockWords)
      blockMix(x, y: y, t: t, r: r)
    }
    for _ in 0..<n {
      let j = Int(x[(2 * r - 1) * 16] & UInt32(n - 1))
      let vj = v + j * blockWords
      for k in 0..<blockWords { x[k] ^= vj[k] }
      blockMix(x, y: y, t: t, r: r)
    }
  }

  // BlockMix with Salsa20/8; the result replaces `b`.
  private static func blockMix(_ b: UnsafeMutablePointer<UInt32>, y: UnsafeMutablePointer<UInt32>, t: UnsafeMutablePointer<UInt32>, r: Int) {
    t.update(from: b + (2 * r - 1) * 16, count: 16)
    for i in 0..<(2 * r) {
      let bi = b + i * 16
      for k in 0..<16 { t[k] ^= bi[k] }
      salsa208(t)
      let destination = i % 2 == 0 ? (i / 2) * 16 : (r + i / 2) * 16
      (y + destination).update(from: t, count: 16)
    }
    b.update(from: y, count: 32 * r)
  }

  @inline(__always) private static func rotl(_ value: UInt32, _ shift: UInt32) -> UInt32 {
    (value << shift) | (value >> (32 - shift))
  }

  private static func salsa208(_ b: UnsafeMutablePointer<UInt32>) {
    var x0 = b[0], x1 = b[1], x2 = b[2], x3 = b[3], x4 = b[4], x5 = b[5], x6 = b[6], x7 = b[7]
    var x8 = b[8], x9 = b[9], x10 = b[10], x11 = b[11], x12 = b[12], x13 = b[13], x14 = b[14], x15 = b[15]
    for _ in stride(from: 0, to: 8, by: 2) {
      x4 ^= rotl(x0 &+ x12, 7); x8 ^= rotl(x4 &+ x0, 9); x12 ^= rotl(x8 &+ x4, 13); x0 ^= rotl(x12 &+ x8, 18)
      x9 ^= rotl(x5 &+ x1, 7); x13 ^= rotl(x9 &+ x5, 9); x1 ^= rotl(x13 &+ x9, 13); x5 ^= rotl(x1 &+ x13, 18)
      x14 ^= rotl(x10 &+ x6, 7); x2 ^= rotl(x14 &+ x10, 9); x6 ^= rotl(x2 &+ x14, 13); x10 ^= rotl(x6 &+ x2, 18)
      x3 ^= rotl(x15 &+ x11, 7); x7 ^= rotl(x3 &+ x15, 9); x11 ^= rotl(x7 &+ x3, 13); x15 ^= rotl(x11 &+ x7, 18)
      x1 ^= rotl(x0 &+ x3, 7); x2 ^= rotl(x1 &+ x0, 9); x3 ^= rotl(x2 &+ x1, 13); x0 ^= rotl(x3 &+ x2, 18)
      x6 ^= rotl(x5 &+ x4, 7); x7 ^= rotl(x6 &+ x5, 9); x4 ^= rotl(x7 &+ x6, 13); x5 ^= rotl(x4 &+ x7, 18)
      x11 ^= rotl(x10 &+ x9, 7); x8 ^= rotl(x11 &+ x10, 9); x9 ^= rotl(x8 &+ x11, 13); x10 ^= rotl(x9 &+ x8, 18)
      x12 ^= rotl(x15 &+ x14, 7); x13 ^= rotl(x12 &+ x15, 9); x14 ^= rotl(x13 &+ x12, 13); x15 ^= rotl(x14 &+ x13, 18)
    }
    b[0] &+= x0; b[1] &+= x1; b[2] &+= x2; b[3] &+= x3; b[4] &+= x4; b[5] &+= x5; b[6] &+= x6; b[7] &+= x7
    b[8] &+= x8; b[9] &+= x9; b[10] &+= x10; b[11] &+= x11; b[12] &+= x12; b[13] &+= x13; b[14] &+= x14; b[15] &+= x15
  }
}
