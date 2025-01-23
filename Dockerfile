FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# 假設你的腳本位於專案根目錄並需要設置執行權限
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# 使用 PM2 啟動伺服器
RUN npm install pm2 -g
CMD ["pm2-runtime", "index.js"]
