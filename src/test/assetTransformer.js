// Jest transformer for binary assets: `require('x.ttf')` evaluates to the file's absolute path.
module.exports = {
  process(_src, filename) {
    return { code: `module.exports = ${JSON.stringify(filename)};` };
  },
};
