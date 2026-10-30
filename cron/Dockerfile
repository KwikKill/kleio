FROM alpine:3.20

RUN apk add --no-cache dcron tini curl tzdata
# The harvest runs at a fixed local hour; without this crond runs on UTC.
ENV TZ=Europe/Paris

WORKDIR /app
COPY harvest.sh /app/harvest.sh
RUN chmod +x /app/harvest.sh

COPY crontab /etc/crontabs/root

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["crond", "-f", "-l", "2"]
