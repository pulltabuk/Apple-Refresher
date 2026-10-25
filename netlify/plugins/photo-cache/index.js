// Keeps the gallery photo copies (.photo-cache, made by
// src/photo-mirror.js) between Netlify builds, so each build only makes
// copies of photos added since the last one. Never fails a build: without
// the cache, the copies are simply made again.

const DIR = '.photo-cache';

module.exports = {
  async onPreBuild({ utils }) {
    try {
      const found = await utils.cache.restore(DIR);
      console.log(found ? 'Photo copies restored from the build cache.' : 'No photo copies in the build cache yet.');
    } catch (err) {
      console.log('Photo copies not restored: ' + err.message);
    }
  },
  async onPostBuild({ utils }) {
    try {
      await utils.cache.save(DIR);
    } catch (err) {
      console.log('Photo copies not saved: ' + err.message);
    }
  },
};
