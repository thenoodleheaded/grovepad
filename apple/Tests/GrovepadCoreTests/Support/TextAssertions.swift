import XCTest

/// Equality on long strings with a useful failure: the first differing
/// offset and a window of both texts around it, instead of two megabytes
/// of JSON in the log.
func assertSameText(_ actual: String, _ expected: String?, _ label: String, file: StaticString = #filePath, line: UInt = #line) {
    guard let expected else {
        return XCTFail("\(label): no expected text", file: file, line: line)
    }
    if actual == expected { return }
    let a = Array(actual.unicodeScalars), e = Array(expected.unicodeScalars)
    var offset = 0
    while offset < a.count, offset < e.count, a[offset] == e[offset] { offset += 1 }
    func window(_ scalars: [Unicode.Scalar]) -> String {
        let lower = max(0, offset - 60), upper = min(scalars.count, offset + 60)
        var out = ""
        out.unicodeScalars.append(contentsOf: scalars[lower..<upper])
        return out
    }
    XCTFail(
        "\(label): texts differ at scalar \(offset) (actual \(a.count), expected \(e.count))\n   actual: …\(window(a))…\n expected: …\(window(e))…",
        file: file, line: line
    )
}
