{ pkgs ? import <nixpkgs> {} }:

let
  inherit (pkgs.stdenv.hostPlatform) system;

  variants = {
    x86_64-linux = {
      archive = "bun-linux-x64";
      sha256 = "sha256-LQP7X7g6yLVnrKCigbLOGhoZ1Ij1bClo2Iw/Jekv5FI=";
    };
    aarch64-linux = {
      archive = "bun-linux-aarch64";
      sha256 = "sha256-SxozLuhhmD65O8/m93D/+U4+MbLDiL2uo8jtNeWO7Q4=";
    };
    x86_64-darwin = {
      archive = "bun-darwin-x64";
      sha256 = "sha256-HQIRuPHcmRGCNEaHrRXnLuhvFUhFpff6R3mUzTQd2bA=";
    };
    aarch64-darwin = {
      archive = "bun-darwin-aarch64";
      sha256 = "sha256-xmnpf2Fk4cluBwF0jbmN+ndJKQjL2DlMdVcTSnNd44E=";
    };
  };

  variant = variants.${system} or (throw "shell.nix: no bun-v1.4.0 release for system '${system}'");

  bun = pkgs.stdenvNoCC.mkDerivation {
    pname = "bun";
    version = "1.4.0";

    src = pkgs.fetchurl {
      url = "https://github.com/oven-sh/bun/releases/download/bun-v1.4.0/${variant.archive}.zip";
      sha256 = variant.sha256;
    };

    sourceRoot = variant.archive;
    nativeBuildInputs = with pkgs; [ unzip ]
      ++ pkgs.lib.optional pkgs.stdenv.hostPlatform.isLinux autoPatchelfHook;
    buildInputs = pkgs.lib.optional pkgs.stdenv.hostPlatform.isLinux pkgs.openssl;

    dontConfigure = true;
    dontBuild = true;

    installPhase = ''
      runHook preInstall
      install -Dm755 bun "$out/bin/bun"
      ln -s "$out/bin/bun" "$out/bin/bunx"
      runHook postInstall
    '';
  };
in
pkgs.mkShell {
  packages = [ bun ];

  shellHook = ''
    echo "attendance-app frontend shell — $(bun --version)"
  '';
}
