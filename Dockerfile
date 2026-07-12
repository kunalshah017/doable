FROM nousresearch/hermes-agent:latest

USER root
WORKDIR /opt/doable

RUN uv pip install --python /opt/hermes/.venv/bin/python "supermemory==3.50.0"

COPY server/pyproject.toml server/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY server/app ./app
COPY deploy/start.sh /opt/doable/start.sh
RUN chmod 0755 /opt/doable/start.sh

ENV HERMES_HOME=/opt/data
ENV HERMES_API_URL=http://127.0.0.1:8642
ENV API_SERVER_ENABLED=true
ENV API_SERVER_HOST=127.0.0.1
ENV API_SERVER_PORT=8642

EXPOSE 8000

ENTRYPOINT ["/init"]
CMD ["/command/with-contenv", "bash", "/opt/doable/start.sh"]