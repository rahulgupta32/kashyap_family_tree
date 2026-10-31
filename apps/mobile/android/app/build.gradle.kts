import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release inputs stay outside source control. key.properties and keystores are ignored.
val releaseProperties = Properties().apply {
    val propertiesFile = rootProject.file("key.properties")
    if (propertiesFile.isFile) propertiesFile.inputStream().use { load(it) }
}
fun releaseInput(property: String, environment: String): String? =
    providers.environmentVariable(environment).orNull?.takeIf { it.isNotBlank() }
        ?: releaseProperties.getProperty(property)?.takeIf { it.isNotBlank() }

val releaseApplicationId = releaseInput("applicationId", "KASHYAP_ANDROID_APPLICATION_ID")?.trim()
val releaseStorePath = releaseInput("storeFile", "KASHYAP_ANDROID_STORE_FILE")
val releaseStorePassword = releaseInput("storePassword", "KASHYAP_ANDROID_STORE_PASSWORD")
val releaseKeyAlias = releaseInput("keyAlias", "KASHYAP_ANDROID_KEY_ALIAS")?.trim()
val releaseKeyPassword = releaseInput("keyPassword", "KASHYAP_ANDROID_KEY_PASSWORD")
val releaseStoreFile = releaseStorePath?.let { rootProject.file(it) }
val releaseConfigurationValid =
    releaseApplicationId?.matches(Regex("[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+")) == true &&
    !releaseApplicationId.orEmpty().startsWith("com.example.", ignoreCase = true) &&
    !releaseApplicationId.equals("com.example", ignoreCase = true) &&
    releaseStoreFile?.isFile == true &&
    !releaseStoreFile?.name.equals("debug.keystore", ignoreCase = true) &&
    !releaseKeyAlias.equals("androiddebugkey", ignoreCase = true) &&
    !releaseKeyAlias.isNullOrBlank() && releaseStorePassword != null && releaseKeyPassword != null

android {
    namespace = "com.example.kashyap_mobile"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // Development identity only; release variants receive the approved private ID.
        applicationId = "com.example.kashyap_mobile"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("approvedRelease") {
            if (releaseConfigurationValid) {
                storeFile = releaseStoreFile
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("approvedRelease")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

// Preserve debug identity even when private release inputs are supplied.
androidComponents {
    onVariants(selector().withBuildType("release")) { variant ->
        releaseApplicationId?.let { variant.applicationId.set(it) }
    }
}

// Never produce a release with absent configuration, example ID or known debug keys.
tasks.configureEach {
    if (name == "preReleaseBuild" || name == "validateSigningRelease") {
        doFirst {
            if (!releaseConfigurationValid) {
                throw GradleException(
                    "Release requires an approved application ID and private non-debug signing configuration."
                )
            }
        }
    }
}
