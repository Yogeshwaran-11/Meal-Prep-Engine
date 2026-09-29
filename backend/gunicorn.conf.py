import os

# Automatically bind to 0.0.0.0:$PORT required by Render
port = os.environ.get("PORT", "10000")
bind = f"0.0.0.0:{port}"

# Free tier resource optimization
workers = int(os.environ.get("WEB_CONCURRENCY", "2"))
worker_class = "uvicorn.workers.UvicornWorker"
timeout = 120
keepalive = 5

# Logging to stdout/stderr for Render live logs
accesslog = "-"
errorlog = "-"
loglevel = "info"
