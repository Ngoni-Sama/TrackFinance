# Builds a signed release APK on this PC (no EAS).
# Needs: JDK 17 + Android SDK in C:\Users\User\Android, and credentials.json + credentials\ (the signing key).
# Output: android\app\build\outputs\apk\release\app-release.apk
$ErrorActionPreference = 'Stop'
$env:JAVA_HOME = 'C:\Users\User\Android\jdk17'
$env:ANDROID_HOME = 'C:\Users\User\Android\sdk'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
Set-Location $PSScriptRoot
npx expo prebuild --platform android --no-install
Set-Content -Path android\local.properties -Value 'sdk.dir=C:/Users/User/Android/sdk'
Set-Location android
# Project cache outside Documents: Windows can block Gradle's folder renames there.
.\gradlew.bat assembleRelease --project-cache-dir 'C:\Users\User\Android\gradle-project-cache\trackfinance' '-PreactNativeArchitectures=arm64-v8a,armeabi-v7a'
