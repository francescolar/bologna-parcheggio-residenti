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

# Genera icone PNG con solo Python stdlib (nessuna dipendenza extra)
RUN python3 - <<'EOF'
import struct, zlib, os

def png(w, h, r, g, b):
    raw = bytes([0] + [r, g, b] * w) * h
    cmp = zlib.compress(raw)
    def chunk(name, data):
        c = name + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', cmp) + chunk(b'IEND', b'')

sizes = [(48,'mipmap-mdpi'), (72,'mipmap-hdpi'), (96,'mipmap-xhdpi'),
         (144,'mipmap-xxhdpi'), (192,'mipmap-xxxhdpi')]
for size, folder in sizes:
    out = f'app/src/main/res/{folder}'
    os.makedirs(out, exist_ok=True)
    with open(f'{out}/ic_launcher.png', 'wb') as f:
        f.write(png(size, size, 29, 78, 216))   # #1d4ed8
    with open(f'{out}/ic_launcher_round.png', 'wb') as f:
        f.write(png(size, size, 29, 78, 216))
print('Icone generate')
EOF

# Build APK debug (non serve firma per installazione con "Origini sconosciute")
RUN gradle assembleDebug --no-daemon 2>&1 | tail -30

# Copia APK finale in /output (volume mount)
CMD ["sh", "-c", \
     "mkdir -p /output && \
      cp app/build/outputs/apk/debug/app-debug.apk /output/parresbo.apk && \
      echo '✓ APK pronto: output/parresbo.apk'"]
