FROM eclipse-temurin:17-jdk-jammy

RUN apt-get update && \
    apt-get install -y wget unzip python3 && \
    rm -rf /var/lib/apt/lists/*

# ── Android SDK ───────────────────────────────────────────────────────────────
ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV ANDROID_HOME=$ANDROID_SDK_ROOT
ENV PATH=$PATH:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools

RUN mkdir -p $ANDROID_SDK_ROOT/cmdline-tools && \
    wget -q "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" \
         -O /tmp/cmdline.zip && \
    unzip -q /tmp/cmdline.zip -d /tmp && \
    mv /tmp/cmdline-tools $ANDROID_SDK_ROOT/cmdline-tools/latest && \
    rm /tmp/cmdline.zip

RUN yes | sdkmanager --licenses > /dev/null 2>&1 && \
    sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"

# ── Gradle ────────────────────────────────────────────────────────────────────
ENV GRADLE_HOME=/opt/gradle
RUN wget -q https://services.gradle.org/distributions/gradle-8.4-bin.zip \
         -O /tmp/gradle.zip && \
    unzip -q /tmp/gradle.zip -d /opt && \
    mv /opt/gradle-8.4 $GRADLE_HOME && \
    rm /tmp/gradle.zip
ENV PATH=$PATH:$GRADLE_HOME/bin

# ── Sorgenti ──────────────────────────────────────────────────────────────────
WORKDIR /build
COPY . .

# Punta all'SDK installato
RUN echo "sdk.dir=$ANDROID_SDK_ROOT" > local.properties

# Le icone (mipmap-*) sono già nel repo, generate da public/icons/icon.svg

# Build APK debug (firmato con la chiave debug automatica di Android: installabile via sideload)
RUN gradle assembleDebug --no-daemon --console=plain

# Copia APK finale in /output (volume mount)
CMD ["sh", "-c", \
     "mkdir -p /output && \
      cp app/build/outputs/apk/debug/app-debug.apk /output/parresbo.apk && \
      echo '✓ APK pronto: output/parresbo.apk'"]
