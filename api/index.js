// Vercel entry. The Nest app is compiled to dist by `npm run build` (decorator metadata needs tsc, not Vercel's own TS step).
const { getHandler } = require("../dist/vercel");

module.exports = async (req, res) => {
  const handle = await getHandler();
  return handle(req, res);
};
