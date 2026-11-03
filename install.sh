#!/bin/bash
set -e

# Mammouth Code Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/mammouth-ai/code/dev/install.sh | bash

REPO="mammouth-ai/code"
BINARY_NAME="mammouth"
INSTALL_DIR="$HOME/.mammouth/bin"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1" >&2; exit 1; }

# Detect OS and architecture
detect_platform() {
  RAW_OS="$(uname -s)"
  OS="$(echo "$RAW_OS" | tr '[:upper:]' '[:lower:]')"
  ARCH="$(uname -m)"

  case "$OS" in
    linux) OS="linux" ;;
    darwin) OS="darwin" ;;
    mingw*|msys*|cygwin*) OS="windows" ;;
    *) error "Unsupported OS: $OS" ;;
  esac

  case "$ARCH" in
    x86_64|amd64) ARCH="x64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *) error "Unsupported architecture: $ARCH" ;;
  esac

  # Prefer the native ARM64 artifact when the shell itself runs under emulation.
  if [ "$OS" = "darwin" ] && [ "$ARCH" = "x64" ]; then
    if [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = "1" ]; then
      ARCH="arm64"
    fi
  fi
  if [ "$OS" = "windows" ] && [ "$ARCH" = "x64" ]; then
    if [[ "$RAW_OS" == *-ARM64 || "${PROCESSOR_IDENTIFIER:-}" == ARM* ]]; then
      ARCH="arm64"
    fi
  fi

  # Check for musl (Alpine Linux, etc.)
  LIBC=""
  if [ "$OS" = "linux" ]; then
    if ldd --version 2>&1 | grep -qi musl || [ -f /etc/alpine-release ]; then
      LIBC="-musl"
    fi
  fi

  # Fall back to the baseline binary on x64 hosts without AVX2.
  VARIANT=""
  if [ "$ARCH" = "x64" ]; then
    if [ "$OS" = "linux" ] && ! grep -qwi avx2 /proc/cpuinfo 2>/dev/null; then
      VARIANT="-baseline"
    fi
    if [ "$OS" = "darwin" ] && [ "$(sysctl -n hw.optional.avx2_0 2>/dev/null || echo 0)" != "1" ]; then
      VARIANT="-baseline"
    fi
    if [ "$OS" = "windows" ]; then
      PS_COMMAND="(Add-Type -MemberDefinition \"[DllImport(\"\"kernel32.dll\"\")] public static extern bool IsProcessorFeaturePresent(int ProcessorFeature);\" -Name Kernel32 -Namespace Win32 -PassThru)::IsProcessorFeaturePresent(40)"
      AVX2=""
      if command -v powershell.exe >/dev/null 2>&1; then
        AVX2=$(powershell.exe -NoProfile -NonInteractive -Command "$PS_COMMAND" 2>/dev/null || true)
      elif command -v pwsh >/dev/null 2>&1; then
        AVX2=$(pwsh -NoProfile -NonInteractive -Command "$PS_COMMAND" 2>/dev/null || true)
      fi
      AVX2=$(echo "$AVX2" | tr -d '\r' | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
      if [ "$AVX2" != "true" ] && [ "$AVX2" != "1" ]; then
        VARIANT="-baseline"
      fi
    fi
  fi

  PLATFORM="${BINARY_NAME}-${OS}-${ARCH}${VARIANT}${LIBC}"
}

# Get latest version from GitHub API
get_latest_version() {
  if [ -n "$VERSION" ]; then
    echo "$VERSION"
    return
  fi

  VERSION=$(curl -sfL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name":' | sed -E 's/.*"v([^"]+)".*/\1/')
  if [ -z "$VERSION" ]; then
    error "Failed to get latest version"
  fi
  echo "$VERSION"
}

# Download and install
install() {
  detect_platform
  VERSION=$(get_latest_version)

  info "Installing Mammouth Code v${VERSION} for ${PLATFORM}..."

  # Create install directory
  mkdir -p "$INSTALL_DIR"

  # Determine archive extension
  if [ "$OS" = "windows" ]; then
    EXT="zip"
  else
    EXT="tar.gz"
  fi

  DOWNLOAD_URL="https://github.com/${REPO}/releases/download/v${VERSION}/${PLATFORM}.${EXT}"
  TEMP_DIR=$(mktemp -d)
  ARCHIVE_PATH="${TEMP_DIR}/${PLATFORM}.${EXT}"

  info "Downloading from ${DOWNLOAD_URL}..."
  if ! curl -fsSL "$DOWNLOAD_URL" -o "$ARCHIVE_PATH"; then
    error "Failed to download. Check if the release exists for your platform."
  fi

  info "Extracting..."
  if [ "$EXT" = "zip" ]; then
    unzip -q "$ARCHIVE_PATH" -d "$TEMP_DIR"
  else
    tar -xzf "$ARCHIVE_PATH" -C "$TEMP_DIR"
  fi

  # Find and copy binary
  BINARY_PATH=$(find "$TEMP_DIR" -name "$BINARY_NAME" -type f | head -n 1)
  if [ -z "$BINARY_PATH" ]; then
    BINARY_PATH=$(find "$TEMP_DIR" -name "${BINARY_NAME}.exe" -type f | head -n 1)
  fi

  if [ -z "$BINARY_PATH" ]; then
    error "Binary not found in archive"
  fi

  rm -f "$INSTALL_DIR/$BINARY_NAME"
  cp "$BINARY_PATH" "$INSTALL_DIR/$BINARY_NAME"
  chmod +x "$INSTALL_DIR/$BINARY_NAME"

  # Cleanup
  rm -rf "$TEMP_DIR"

  info "Installed to ${INSTALL_DIR}/${BINARY_NAME}"

  # Add to PATH instructions
  setup_path
}

setup_path() {
  SHELL_NAME=$(basename "$SHELL")
  EXPORT_LINE="export PATH=\"\$HOME/.mammouth/bin:\$PATH\""

  case "$SHELL_NAME" in
    bash)
      PROFILE="$HOME/.bashrc"
      [ -f "$HOME/.bash_profile" ] && PROFILE="$HOME/.bash_profile"
      ;;
    zsh)
      PROFILE="$HOME/.zshrc"
      ;;
    fish)
      EXPORT_LINE="set -gx PATH \$HOME/.mammouth/bin \$PATH"
      PROFILE="$HOME/.config/fish/config.fish"
      ;;
    *)
      PROFILE="$HOME/.profile"
      ;;
  esac

  # Check if already in PATH
  if echo "$PATH" | grep -q ".mammouth/bin"; then
    info "Mammouth Code is ready! Run 'mammouth' to get started."
    return
  fi

  # Add to profile if not already there
  if [ -f "$PROFILE" ] && grep -q ".mammouth/bin" "$PROFILE"; then
    info "PATH already configured in $PROFILE"
  else
    mkdir -p "$(dirname "$PROFILE")"
    echo "" >> "$PROFILE"
    echo "# Mammouth Code" >> "$PROFILE"
    echo "$EXPORT_LINE" >> "$PROFILE"
    info "Added to PATH in $PROFILE"
  fi

  echo ""
  info "Installation complete!"
  echo ""
  echo "To start using Mammouth Code, either:"
  echo "  1. Restart your terminal, or"
  echo "  2. Run: source $PROFILE"
  echo ""
  echo "Then run: mammouth"
}

install
