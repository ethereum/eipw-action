import * as eipw from "eipw-lint-js";
async function main() {
    const result = await eipw.lint(["/tmp/eip-1000.md"]);
    console.log(result);
}
main();
