const fs = require("fs");
const path = require("path").join(__dirname, "UserModal.jsx");
let s = fs.readFileSync(path, "utf8");

const blockStart = s.indexOf('                <motion>\r\n                <motion>');
const blockStartLf = s.indexOf('                <motion>\n                <div className="permissions-container"');
const startIdx = blockStartLf >= 0 ? blockStartLf : s.indexOf('                <div className="permissions-container" hidden');

if (startIdx < 0) {
  console.error("block start not found");
  process.exit(1);
}

const endIdx = s.indexOf("              </motion>\n              </div>\n              </form>", startIdx);
const endIdxCr = s.indexOf("              </motion>\r\n              </div>\r\n              </form>", startIdx);
const end = endIdxCr >= 0 ? endIdxCr : s.indexOf("              </motion>", startIdx);

if (end < 0) {
  const fallback = s.indexOf("              </div>\r\n              </form>", startIdx);
  const fallbackLf = s.indexOf("              </motion>\n              </div>\n              </form>", startIdx);
  console.error("end not found", fallback, fallbackLf);
  // try without motion closing
  const fb2 = s.indexOf("                </div>\r\n              </div>\r\n              </form>", startIdx);
  console.error("fb2", fb2);
  process.exit(1);
}

const newS = s.slice(0, startIdx) + s.slice(end + "              </motion>".length);
fs.writeFileSync(path, newS);
console.log("patched ok, removed", end - startIdx, "chars");
