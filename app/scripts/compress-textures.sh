#!/bin/bash

# Texture Compression Script
# Compresses PNG textures using pngquant (lossy) and optipng (lossless)
# Target: reduce 53MB of textures to <10MB

echo "🎨 Texture Compression Tool"
echo "============================"
echo ""
echo "Current total size:"
du -sh public/textures public/*.png 2>/dev/null | grep -v "public/icons" | grep -v "public/school" | grep -v "public/fonts" | grep -v "public/svgs"
echo ""

# Check if tools are installed
command -v pngquant >/dev/null 2>&1 || { echo "❌ pngquant not installed. Install with: sudo apt-get install pngquant"; exit 1; }
command -v optipng >/dev/null 2>&1 || { echo "❌ optipng not installed. Install with: sudo apt-get install optipng"; exit 1; }

echo "✅ Compression tools found"
echo ""

# Create backup
BACKUP_DIR="public/textures-backup-$(date +%Y%m%d-%H%M%S)"
echo "📦 Creating backup at $BACKUP_DIR..."
mkdir -p "$BACKUP_DIR"
cp -r public/textures "$BACKUP_DIR/"
cp public/*.png "$BACKUP_DIR/" 2>/dev/null
echo "✅ Backup created"
echo ""

# Compress function
compress_texture() {
    local file="$1"
    local original_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file")
    
    echo "🔄 Compressing $(basename "$file")..."
    
    # Step 1: Lossy compression with pngquant (reduce colors intelligently)
    pngquant --quality=80-95 --skip-if-larger --force --ext .png "$file"
    
    # Step 2: Lossless optimization with optipng
    optipng -o2 -quiet "$file"
    
    local new_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file")
    local saved=$((original_size - new_size))
    local percent=$((saved * 100 / original_size))
    
    echo "   ✅ Saved $((saved / 1024))KB ($percent%)"
}

# Compress all textures
echo "🚀 Compressing textures..."
echo ""

# Material textures
for file in public/textures/materials/*.png; do
    [ -f "$file" ] && compress_texture "$file"
done

# Spell school textures
for file in public/textures/spell-schools/*.png; do
    [ -f "$file" ] && compress_texture "$file"
done

# Other textures
for file in public/textures/*.png; do
    [ -f "$file" ] && compress_texture "$file"
done

# Root level textures
for file in public/{gate,crest,Damage,Healing}.png; do
    [ -f "$file" ] && compress_texture "$file"
done

echo ""
echo "✨ Compression complete!"
echo ""
echo "New total size:"
du -sh public/textures public/*.png 2>/dev/null | grep -v "public/icons" | grep -v "public/school" | grep -v "public/fonts" | grep -v "public/svgs"
echo ""
echo "📦 Backup saved at: $BACKUP_DIR"
echo "   To restore: cp -r $BACKUP_DIR/textures/* public/textures/ && cp $BACKUP_DIR/*.png public/"
