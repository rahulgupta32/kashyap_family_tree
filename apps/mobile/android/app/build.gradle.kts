import java.util.Properties
import java.util.Base64

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
val devPreview = providers.environmentVariable("KASHYAP_DEV_PREVIEW").orNull == "true"
val previewTarget = providers.gradleProperty("target").orNull.orEmpty().replace('\\', '/').lowercase().contains("dev_preview")
val previewDefines = providers.gradleProperty("dart-defines").orNull.orEmpty().split(",").filter { it.isNotBlank() }.map { String(Base64.getDecoder().decode(it)) }.any { it.substringBefore("=") in setOf("ENABLE_DEV_PREVIEW", "ENABLE_DEV_FULL_STACK") }
val usbTest = providers.environmentVariable("KASHYAP_USB_TEST").orNull == "true"
val internalPreview = providers.environmentVariable("KASHYAP_INTERNAL_PREVIEW").orNull == "true"
val releaseConfigurationValid =
    releaseApplicationId?.matches(Regex("[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+")) == true &&
    !releaseApplicationId.orEmpty().startsWith("com.example.", ignoreCase = true) &&
    !releaseApplicationId.equals("com.example", ignoreCase = true) &&
    releaseStoreFile?.isFile == true &&
    !releaseStoreFile?.name.equals("debug.keystore", ignoreCase = true) &&
    !releaseKeyAlias.equals("androiddebugkey", ignoreCase = true) &&
    !releaseKeyAlias.isNullOrBlank() && releaseStorePassword != null && releaseKeyPassword != null

android {
    buildFeatures { resValues = true }
    namespace = "com.example.kashyap_mobile"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        manifestPlaceholders["appLabel"] = "@string/app_name"
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
        debug {
            if (devPreview) {
                if (usbTest) throw GradleException("Choose either offline preview or USB testing.")
                applicationIdSuffix = ".devpreview"
                resValue("string", "dev_preview_name", "Nepali Bansawali — Offline Preview")
                manifestPlaceholders["appLabel"] = "@string/dev_preview_name"
            }
            if (usbTest) {
                applicationIdSuffix = ".usbtest"
                resValue("string", "usb_test_name", "Nepali Bansawali — USB Test")
                manifestPlaceholders["appLabel"] = "@string/usb_test_name"
            }
        }
        release {
            signingConfig = signingConfigs.getByName("approvedRelease")
            if (internalPreview) {
                resValue("string", "internal_preview_name", "नेपाली वंशावली — Preview")
                manifestPlaceholders["appLabel"] = "@string/internal_preview_name"
            }
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
    if (name == "preProfileBuild") {
        doFirst {
            if (devPreview || previewTarget || previewDefines) {
                throw GradleException("Development preview is debug-only and forbidden in release/profile builds.")
            }
        }
    }
    if (name == "preReleaseBuild" || name == "validateSigningRelease") {
        doFirst {
            if (devPreview || previewTarget || previewDefines) {
                throw GradleException("Development preview is debug-only and forbidden in release/profile builds.")
            }
            if (usbTest) throw GradleException("USB testing is debug-only; unset KASHYAP_USB_TEST for release.")
            if (!releaseConfigurationValid) {
                throw GradleException(
                    "Release requires an approved application ID and private non-debug signing configuration."
                )
            }
            if (internalPreview && !releaseApplicationId.orEmpty().endsWith(".preview")) {
                throw GradleException("Internal preview requires a separate approved .preview application ID.")
            }
        }
    }
}
