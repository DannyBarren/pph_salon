"""SQLModel ORM models.

Importing this package registers every table on ``SQLModel.metadata`` — which
is what Alembic's ``env.py`` targets for autogeneration. Import models from here
(``from app.models import User``) so relationship forward-references resolve.
"""

from app.models.audit_log import AuditLog
from app.models.base import TimestampMixin
from app.models.daily_performance import DailyPerformance
from app.models.goal import Goal, GoalApprovalStatus
from app.models.message import MessageAcknowledgment, MessageBoardPost
from app.models.notification import Notification, NotificationType
from app.models.pay_tier import PayTier
from app.models.salon import Salon
from app.models.user import User, UserRole
from app.models.week import Week

__all__ = [
    "TimestampMixin",
    "AuditLog",
    "Salon",
    "User",
    "UserRole",
    "PayTier",
    "Week",
    "DailyPerformance",
    "MessageBoardPost",
    "MessageAcknowledgment",
    "Goal",
    "GoalApprovalStatus",
    "Notification",
    "NotificationType",
]
