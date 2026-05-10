#!/bin/bash
# =============================================================
# Deploy Script: ระบบใบสำคัญจ่ายเงิน INC
# VM: openclaw-server (34.87.120.229)
# OS: Ubuntu 22.04
# =============================================================

set -e

echo "========================================="
echo "  Deploy ระบบใบสำคัญจ่ายเงิน INC"
echo "========================================="

# Step 1: Update system
echo ""
echo "[1/7] Updating system packages..."
sudo apt-get update -y
sudo apt-get upgrade -y

# Step 2: Install Node.js 20 LTS
echo ""
echo "[2/7] Installing Node.js 20 LTS..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "Node.js already installed: $(node -v)"
fi

# Step 3: Install system dependencies for canvas & mupdf
echo ""
echo "[3/7] Installing system dependencies..."
sudo apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    pkg-config \
    python3 \
    git \
    nginx

# Step 4: Clone repo
echo ""
echo "[4/7] Cloning repository..."
APP_DIR="$HOME/payment-voucher-inc"
if [ -d "$APP_DIR" ]; then
    echo "Directory exists. Pulling latest..."
    cd "$APP_DIR"
    git pull origin master
else
    cd "$HOME"
    git clone https://github.com/rushchakit86-commits/payment-voucher-inc.git
    cd "$APP_DIR"
fi

# Step 5: Install npm dependencies
echo ""
echo "[5/7] Installing npm dependencies..."
npm install --production

# Step 6: Create .env file (if not exists)
echo ""
echo "[6/7] Setting up environment..."
if [ ! -f .env ]; then
    cat > .env << 'ENVFILE'
PORT=3000
# AI API Keys (เพิ่ม key ที่ต้องการใช้)
# DEEPSEEK_API_KEY=your_deepseek_key
# OPENAI_API_KEY=your_openai_key
# GEMINI_API_KEY=your_gemini_key
# ANTHROPIC_API_KEY=your_anthropic_key
# OLLAMA_BASE_URL=http://localhost:11434
ENVFILE
    echo ".env file created. Please edit with your API keys later."
else
    echo ".env file already exists."
fi

# Create uploads directory
mkdir -p uploads
mkdir -p data

# Step 7: Setup PM2
echo ""
echo "[7/7] Setting up PM2 process manager..."
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
fi

# Stop existing if running
pm2 stop payment-voucher 2>/dev/null || true
pm2 delete payment-voucher 2>/dev/null || true

# Start with PM2
pm2 start server.js --name "payment-voucher" --env production
pm2 save
pm2 startup systemd -u $USER --hp $HOME | tail -1 | sudo bash

echo ""
echo "========================================="
echo "  Setup Nginx reverse proxy..."
echo "========================================="

# Configure Nginx
sudo tee /etc/nginx/sites-available/payment-voucher > /dev/null << 'NGINX'
server {
    listen 80;
    server_name _;

    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX

# Enable site
sudo ln -sf /etc/nginx/sites-available/payment-voucher /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx

echo ""
echo "========================================="
echo "  DEPLOYMENT COMPLETE!"
echo "========================================="
echo ""
echo "  App URL: http://34.87.120.229"
echo "  PM2 Status: pm2 status"
echo "  PM2 Logs: pm2 logs payment-voucher"
echo "  Restart: pm2 restart payment-voucher"
echo ""
echo "  Next steps:"
echo "  1. Edit .env to add your API keys:"
echo "     nano ~/payment-voucher-inc/.env"
echo "  2. Restart after editing:"
echo "     pm2 restart payment-voucher"
echo ""
