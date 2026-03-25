cat > replit.nix << 'EOF'
{ pkgs }: {
  deps = [
    pkgs.nodejs-18_x
  ];
}
EOF