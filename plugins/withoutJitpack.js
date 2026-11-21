// Expo's standard Android project lists jitpack.io as a place to download libraries from, next
// to Google's repository and Maven Central. JitPack serves builds of any GitHub project, so it is
// the least controlled of the three, and nothing this app uses comes from it (checked in step 0:
// the app builds with the line removed and the network off). This removes it every time the
// android/ folder is generated, so a library can only come from Google or Maven Central.
//
// If a library added later really is published only on JitPack, the build fails with "Could not
// find <library>". That is the moment to decide whether to trust it, not before.
const { withProjectBuildGradle } = require('expo/config-plugins');

module.exports = function withoutJitpack(config) {
  return withProjectBuildGradle(config, (gradle) => {
    gradle.modResults.contents = gradle.modResults.contents
      .split('\n')
      .filter((line) => !line.includes('jitpack.io'))
      .join('\n');
    return gradle;
  });
};
