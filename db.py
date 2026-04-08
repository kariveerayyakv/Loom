"""
LOOM — SQLAlchemy Models
File must be named db.py  (app.py imports from db)
"""

from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()


class Complaint(db.Model):
    __tablename__ = 'complaints'

    id         = db.Column(db.Integer,     primary_key=True, autoincrement=True)
    anon_id    = db.Column(db.String(10),  nullable=False)
    category   = db.Column(db.String(50),  nullable=False)
    title      = db.Column(db.String(200), nullable=False)
    body       = db.Column(db.Text,        nullable=False)
    priority   = db.Column(db.Enum('low', 'medium', 'high'),                       default='medium')
    status     = db.Column(db.Enum('pending', 'in-review', 'critical', 'resolved'), default='pending')
    votes      = db.Column(db.Integer,  default=0,     nullable=False)
    flagged    = db.Column(db.Boolean,  default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    vote_records = db.relationship('Vote', backref='complaint', lazy=True,
                                   cascade='all, delete-orphan')

    def __repr__(self):
        return f'<Complaint {self.id}: {self.title[:40]}>'


class Vote(db.Model):
    __tablename__ = 'votes'

    id           = db.Column(db.Integer,    primary_key=True, autoincrement=True)
    complaint_id = db.Column(db.Integer,    db.ForeignKey('complaints.id'), nullable=False)
    voter_ip     = db.Column(db.String(45), nullable=False)   # IPv6-safe
    voted_at     = db.Column(db.DateTime,   default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('complaint_id', 'voter_ip', name='uq_one_vote_per_ip'),
    )

    def __repr__(self):
        return f'<Vote complaint={self.complaint_id} ip={self.voter_ip}>'