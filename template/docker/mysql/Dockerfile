FROM mysql:8.0

ENV MYSQL_ROOT_PASSWORD=password
ENV MYSQL_DATABASE=app
ENV MYSQL_USER=user
ENV MYSQL_PASSWORD=password

COPY init.sql /docker-entrypoint-initdb.d/