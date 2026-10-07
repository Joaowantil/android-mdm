from pydantic import BaseModel


class BlocklistViolation(BaseModel):
    device_pk: int
    device_id: str
    device_name: str | None = None
    policy_id: int
    policy_name: str
    violating_apps: list[str]
