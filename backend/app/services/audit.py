from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog


async def log_action(
    db: AsyncSession,
    *,
    actor: dict | None,
    action: str,
    target_type: str | None = None,
    target_id: str | int | None = None,
    details: str | None = None,
    ip_address: str | None = None,
) -> None:
    """Appends one row to the audit trail. Call this right before/after the
    change it describes, in the same request - never batch these up.

    `actor` is the dict shape get_current_user()/get_current_admin() return
    ({"email": ..., "role": ...}), or None for actions with no authenticated
    admin (shouldn't normally happen for the actions this is used on).
    """
    entry = AuditLog(
        actor_email=actor.get("email") if actor else None,
        actor_role=actor.get("role") if actor else None,
        action=action,
        target_type=target_type,
        target_id=str(target_id) if target_id is not None else None,
        details=details,
        ip_address=ip_address,
    )
    db.add(entry)
    # Deliberately no db.flush()/commit() here - the caller's own request
    # already flushes/commits at the end, and this row should land in the
    # same transaction as the change it's describing (so a rolled-back
    # request never leaves an orphaned "it happened" log entry behind).
