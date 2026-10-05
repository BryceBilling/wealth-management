FROM postgres:17-alpine
RUN apk add --no-cache age
COPY backup.sh /backup.sh
CMD ["sh", "-c", "while true; do sh /backup.sh || exit 1; sleep 86400; done"]
