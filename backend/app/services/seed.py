from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import User
from app.core.security import get_password_hash


async def seed_admin(db: AsyncSession):
    """Create default admin user if none exists."""
    result = await db.execute(select(User).where(User.email == "admin@mdm.local"))
    existing = result.scalar_one_or_none()
    if not existing:
        admin = User(
            email="admin@mdm.local",
            hashed_password=get_password_hash("admin123"),
            full_name="MDM Administrator",
            role="admin",
            is_active=True,
        )
        db.add(admin)
        await db.commit()
