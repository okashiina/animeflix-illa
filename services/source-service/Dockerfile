FROM node:20-slim
WORKDIR /app

# Runtime deps only (tsx runs the TS directly; typescript is dev-only for typecheck).
COPY package.json ./
RUN npm install --omit=dev

COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm", "start"]
