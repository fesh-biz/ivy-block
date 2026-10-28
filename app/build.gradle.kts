plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "biz.fesh.ivyblock"
    compileSdk = 35

    defaultConfig {
        applicationId = "biz.fesh.ivyblock"
        minSdk = 26
        targetSdk = 35
        // CI sets GITHUB_RUN_NUMBER so every build can be installed over the previous one.
        versionCode = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1
        versionName = "1.0." + (System.getenv("GITHUB_RUN_NUMBER") ?: "0")
    }

    signingConfigs {
        // Development key committed to the repo so builds from CI and from a laptop
        // can update each other. Replace with a private key before publishing to Google Play.
        create("dev") {
            storeFile = rootProject.file("keystore/ivyblock-dev.jks")
            storePassword = "ivyblock"
            keyAlias = "ivyblock"
            keyPassword = "ivyblock"
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("dev")
        }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("dev")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    lint {
        abortOnError = false
    }
}
