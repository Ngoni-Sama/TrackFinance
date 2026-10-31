// Signs local release builds (gradlew assembleRelease) with the keystore described in
// credentials.json — the same one EAS uses — so local and EAS APKs can update each other.
// credentials.json and the keystore are git-ignored; without them the build falls back to debug signing.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// trackfinance-release-signing';

const SNIPPET = `
${MARKER}
def tfCredsFile = rootProject.file("../credentials.json")
if (tfCredsFile.exists()) {
    def tfCreds = new groovy.json.JsonSlurper().parse(tfCredsFile).android.keystore
    android.signingConfigs.create("tfRelease") {
        storeFile rootProject.file("../" + tfCreds.keystorePath)
        storePassword tfCreds.keystorePassword
        keyAlias tfCreds.keyAlias
        keyPassword tfCreds.keyPassword
    }
    android.buildTypes.release.signingConfig android.signingConfigs.tfRelease
}
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes(MARKER)) mod.modResults.contents += SNIPPET;
    return mod;
  });
};
