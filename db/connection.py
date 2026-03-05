import os
from sqlalchemy import create_engine
from dotenv import load_dotenv

# Load environment variables from .env in parent directory
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

DATABASE_URL = os.getenv("DATABASE_URL_PYTHON")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL_PYTHON not set in .env file")

engine = create_engine(DATABASE_URL)
