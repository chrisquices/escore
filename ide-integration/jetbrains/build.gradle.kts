plugins {
    java
    id("org.jetbrains.intellij.platform") version "2.19.0"
}

group = "strata.ide"
// Keep one development version and replace its archive on rebuild.
version = "0.1.0"

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        val localIdePath = providers.gradleProperty("localIdePath")
        if (localIdePath.isPresent) {
            local(localIdePath.get())
        } else {
            webstorm("2026.1")
        }
    }
}

java {
    toolchain.languageVersion = JavaLanguageVersion.of(25)
}

tasks.withType<JavaCompile>().configureEach {
    options.release = 21
}

intellijPlatform {
    pluginConfiguration {
        name = "Strata IDE Integration"
        version = project.version.toString()
        ideaVersion {
            sinceBuild = "261"
        }
    }
}
