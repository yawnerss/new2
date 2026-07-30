import os
import subprocess
import hashlib

def run(cmd, cwd=None):
    print(f"$ {' '.join(cmd)}")
    subprocess.run(cmd, cwd=cwd, check=True)

# Setup
runner_dir = "actions-runner"
os.makedirs(runner_dir, exist_ok=True)

version = "2.336.0"
filename = f"actions-runner-linux-x64-{version}.tar.gz"
url = f"https://github.com/actions/runner/releases/download/v{version}/{filename}"
expected_sha256 = "04cf0be1aff4c3ec3554466c39124ca250e3effd8873bb7e8d68535aa9505d5d"

# Download the runner package
run(["curl", "-o", filename, "-L", url], cwd=runner_dir)

# Validate the hash
filepath = os.path.join(runner_dir, filename)
sha256 = hashlib.sha256()
with open(filepath, "rb") as f:
    for chunk in iter(lambda: f.read(8192), b""):
        sha256.update(chunk)

actual_hash = sha256.hexdigest()
if actual_hash != expected_sha256:
    raise ValueError(f"Hash mismatch!\nExpected: {expected_sha256}\nGot:      {actual_hash}")
print("Hash OK")

# Extract the installer
run(["tar", "xzf", filename], cwd=runner_dir)

# Configure the runner — pull from env vars instead of hardcoding
repo_url = os.environ["RUNNER_REPO_URL"]   # e.g. https://github.com/your-org/your-repo
token = os.environ["RUNNER_TOKEN"]         # generate fresh from repo Settings > Actions > Runners
run(["./config.sh", "--url", repo_url, "--token", token], cwd=runner_dir)

# Run it
run(["./run.sh"], cwd=runner_dir)
