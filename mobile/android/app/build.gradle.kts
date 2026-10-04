plugins { id("com.android.application") }

android {
    namespace = "dev.ciban.ime"
    providers.gradleProperty("cibanDebugKeystore").orNull?.let { keyPath ->
        signingConfigs.getByName("debug").storeFile = file(keyPath)
    }
    compileSdk = 36
    defaultConfig {
        applicationId = "dev.ciban.ime"
        minSdk = 26
        targetSdk = 36
        versionCode = 5
        versionName = "0.5.0-demo"
        testInstrumentationRunner = "dev.ciban.ime.SmokeInstrumentation"
        ndk { abiFilters += listOf("arm64-v8a", "x86_64") }
    }
    flavorDimensions += "language"
    productFlavors {
        create("english") {
            dimension = "language"
            applicationId = "dev.ciban.english"
            resValue("string", "app_name", "词伴 · 英语")
            buildConfigField("String", "LEARNING_LANGUAGE", "\"en\"")
        }
        create("french") {
            dimension = "language"
            applicationId = "dev.ciban.french"
            resValue("string", "app_name", "词伴 · 法语")
            buildConfigField("String", "LEARNING_LANGUAGE", "\"fr\"")
        }
    }
    buildFeatures { buildConfig = true; resValues = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    packaging { jniLibs { useLegacyPackaging = false } }
    lint { abortOnError = true }
}
