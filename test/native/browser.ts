// Only the external Google browser is stubbed; native App plugin is real.
export const Browser = {
  async open() {}, async close() {},
  async addListener() { return { async remove() {} }; },
};
