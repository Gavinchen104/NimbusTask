# Build from repository root: docker build -f docker/Dockerfile .
FROM node:20-bookworm AS build
WORKDIR /src
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN npm ci \
  && npm run build -w @nimbustask/shared \
  && npm run build -w @nimbustask/api

FROM public.ecr.aws/lambda/nodejs:20
WORKDIR ${LAMBDA_TASK_ROOT}
COPY --from=build /src/package.json /src/package-lock.json ./
COPY --from=build /src/node_modules ./node_modules
COPY --from=build /src/packages/shared ./packages/shared
COPY --from=build /src/apps/api/dist ./dist
COPY docker/package.lambda.json ./package.json
ENV NODE_ENV=production
CMD ["dist/handler.lambdaHandler"]
