# Build context is the repository root (see docker-compose.yml).
FROM golang:1.23-alpine AS build
WORKDIR /src
COPY services/go/ ./
# go mod tidy resolves go.sum on first build; commit the generated go.sum
# (docker compose cp or a local Go install) to pin dependencies.
RUN go mod tidy
RUN go vet ./... && go test ./...
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/ ./cmd/...

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata && adduser -D -u 10001 app
COPY --from=build /out/ /usr/local/bin/
COPY db/postgres/migrations /migrations
COPY scripts /scripts
USER app
EXPOSE 8080
CMD ["tracker"]
