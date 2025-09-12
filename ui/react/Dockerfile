FROM node:18-alpine as build
ARG VITE_API_BASE
ENV VITE_API_BASE=${VITE_API_BASE}
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN if [ -f package-lock.json ]; then npm ci; elif [ -f pnpm-lock.yaml ]; then npm -g i pnpm && pnpm i --frozen-lockfile; elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; else npm i; fi
COPY . .
RUN npm run build || yarn build || pnpm build

FROM nginx:alpine
COPY --from=build /app/dist/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx","-g","daemon off;"]
