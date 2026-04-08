"""
LOOM — Flask Backend (app.py)
Run:  python app.py
"""

from flask import Flask, request, jsonify, session
from flask_cors import CORS
from db import db, Complaint, Vote
from moderation import moderate_complaint_ai
from datetime import datetime, timedelta
import os, random, string
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# ── Secret key ──────────────────────────────────────────────────
app.secret_key = os.getenv('SECRET_KEY', 'loom-dev-secret-2024')

# ── CORS — allow all origins (local + Render + Netlify) ─────────
CORS(app, supports_credentials=True, origins="*")

# ── Database ─────────────────────────────────────────────────────
app.config['SQLALCHEMY_DATABASE_URI'] = (
    f"mysql+mysqlconnector://{os.getenv('DB_USER', 'root')}:"
    f"{os.getenv('DB_PASSWORD', '')}@"
    f"{os.getenv('DB_HOST', 'localhost')}:"
    f"{os.getenv('DB_PORT', '3306')}/"
    f"{os.getenv('DB_NAME', 'loom_db')}"
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_pre_ping': True,
    'pool_recycle':  300,
}

db.init_app(app)

with app.app_context():
    db.create_all()

    # Auto-clean resolved complaints older than 30 days on startup
    cutoff       = datetime.utcnow() - timedelta(days=30)
    old_resolved = Complaint.query.filter(
        Complaint.status == 'resolved',
        Complaint.created_at < cutoff
    ).all()
    for c in old_resolved:
        db.session.delete(c)
    if old_resolved:
        db.session.commit()
        print(f'[LOOM] Auto-cleaned {len(old_resolved)} old resolved complaint(s).')

# ── Constants ─────────────────────────────────────────────────────
VOTE_THRESHOLD  = 5
PRIORITY_HIGH   = 15
PRIORITY_MEDIUM = 5

ADMIN_CREDENTIALS = {
    'admin':     'admin123',
    'principal': 'principal@mgm',
    'hod':       'hod@mgm2024'
}

VALID_STUDENT_IDS = [
    'A1B2C3D4', 'X7Y8Z9W0', 'L1M2N3P4', 'Q5R6S7T8', 'U9V0W1X2',
    'Y2Z1W4T7', 'H6G5F4E3', '3K9FP2M1', 'J7R4X9C2', 'V8B5N6Q3'
]

# ── Helpers ───────────────────────────────────────────────────────

def auto_priority(votes):
    if votes >= PRIORITY_HIGH:   return 'high'
    if votes >= PRIORITY_MEDIUM: return 'medium'
    return 'low'

def time_ago(dt):
    s = (datetime.utcnow() - dt).total_seconds()
    if s < 60:     return 'just now'
    if s < 3600:   return f'{int(s // 60)}m ago'
    if s < 86400:  return f'{int(s // 3600)}h ago'
    if s < 604800: return f'{int(s // 86400)}d ago'
    return f'{int(s // 604800)}w ago'

def rand_anon():
    return '#' + ''.join(random.choices(string.ascii_lowercase + string.digits, k=4))

def get_voter_id():
    return request.headers.get('X-User-Id', request.remote_addr)

def complaint_to_dict(c, voter_ip=None):
    voted = False
    if voter_ip:
        voted = Vote.query.filter_by(
            complaint_id=c.id, voter_ip=voter_ip
        ).first() is not None
    return {
        'id':        c.id,
        'anonId':    c.anon_id,
        'category':  c.category,
        'title':     c.title,
        'body':      c.body,
        'votes':     c.votes,
        'voted':     voted,
        'status':    c.status,
        'priority':  c.priority,
        'flagged':   c.flagged,
        'time':      time_ago(c.created_at),
        'createdAt': c.created_at.isoformat()
    }

# ── Complaints ────────────────────────────────────────────────────

@app.route('/api/complaints', methods=['GET'])
def get_complaints():
    status = request.args.get('status')
    voter_id = get_voter_id()
    q      = Complaint.query
    if status and status != 'all':
        q = q.filter_by(status=status)
    complaints = q.order_by(Complaint.votes.desc()).all()
    return jsonify([complaint_to_dict(c, voter_id) for c in complaints])


@app.route('/api/complaints/<int:cid>', methods=['GET'])
def get_complaint(cid):
    voter_id = get_voter_id()
    c  = db.session.get(Complaint, cid)
    if not c:
        return jsonify({'error': 'Complaint not found'}), 404
    return jsonify(complaint_to_dict(c, voter_id))


@app.route('/api/complaints', methods=['POST'])
def create_complaint():
    data     = request.get_json() or {}
    category = data.get('category', '').strip()
    title    = data.get('title',    '').strip()
    body     = data.get('body',     '').strip()
    priority = data.get('priority', 'medium')

    if not all([category, title, body]):
        return jsonify({'error': 'category, title and body are required'}), 400

    result = moderate_complaint_ai(title, body)
    if not result['pass']:
        return jsonify({'error': result['reason']}), 422

    c = Complaint(
        anon_id=rand_anon(), category=category,
        title=title, body=body, priority=priority,
        status='pending', votes=0, flagged=False
    )
    db.session.add(c)
    db.session.commit()
    return jsonify(complaint_to_dict(c)), 201


@app.route('/api/complaints/<int:cid>/vote', methods=['POST'])
def vote(cid):
    voter_id = get_voter_id()
    c  = db.session.get(Complaint, cid)
    if not c:
        return jsonify({'error': 'Complaint not found'}), 404

    if Vote.query.filter_by(complaint_id=cid, voter_ip=voter_id).first():
        return jsonify({'error': 'You have already voted on this complaint'}), 409

    db.session.add(Vote(complaint_id=cid, voter_ip=voter_id))
    c.votes   += 1
    c.priority = auto_priority(c.votes)

    escalated = False
    if c.votes >= VOTE_THRESHOLD and c.status == 'pending':
        c.status  = 'critical'
        c.flagged = True
        escalated = True

    db.session.commit()
    return jsonify({
        'votes':     c.votes,
        'escalated': escalated,
        'complaint': complaint_to_dict(c, voter_id)
    })


@app.route('/api/complaints/<int:cid>/status', methods=['PATCH'])
def update_status(cid):
    c = db.session.get(Complaint, cid)
    if not c:
        return jsonify({'error': 'Complaint not found'}), 404

    data   = request.get_json() or {}
    status = data.get('status')
    valid  = ['pending', 'in-review', 'critical', 'resolved']
    if status not in valid:
        return jsonify({'error': f'status must be one of {valid}'}), 400

    c.status = status
    db.session.commit()
    return jsonify(complaint_to_dict(c))


@app.route('/api/complaints/<int:cid>', methods=['DELETE'])
def delete_complaint(cid):
    c = db.session.get(Complaint, cid)
    if not c:
        return jsonify({'error': 'Complaint not found'}), 404
    db.session.delete(c)
    db.session.commit()
    return jsonify({'success': True})

# ── Stats ─────────────────────────────────────────────────────────

@app.route('/api/stats', methods=['GET'])
def get_stats():
    total     = Complaint.query.count()
    critical  = Complaint.query.filter_by(status='critical').count()
    resolved  = Complaint.query.filter_by(status='resolved').count()
    pending   = Complaint.query.filter_by(status='pending').count()
    in_review = Complaint.query.filter_by(status='in-review').count()
    votes     = db.session.query(db.func.sum(Complaint.votes)).scalar() or 0
    return jsonify({
        'total':    total,
        'critical': critical,
        'resolved': resolved,
        'pending':  pending,
        'inReview': in_review,
        'votes':    int(votes)
    })

# ── Admin auth ────────────────────────────────────────────────────

@app.route('/api/user/login', methods=['POST'])
def user_login():
    data    = request.get_json() or {}
    user_id = data.get('userId', '').strip()
    
    if not user_id:
        return jsonify({'success': False, 'error': 'User ID is required'}), 400
        
    if user_id in VALID_STUDENT_IDS:
        return jsonify({'success': True, 'userId': user_id})
        
    return jsonify({'success': False, 'error': 'Invalid User ID'}), 401

@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    data = request.get_json() or {}
    user = data.get('username', '').strip()
    pw   = data.get('password', '')

    if not user or not pw:
        return jsonify({'success': False, 'error': 'Username and password required'}), 400

    if ADMIN_CREDENTIALS.get(user) == pw:
        return jsonify({'success': True, 'username': user})

    return jsonify({'success': False, 'error': 'Invalid username or password'}), 401


@app.route('/api/admin/session', methods=['POST'])
def admin_session_check():
    data = request.get_json() or {}
    user = data.get('username', '').strip()
    pw   = data.get('password', '')
    if user and ADMIN_CREDENTIALS.get(user) == pw:
        return jsonify({'loggedIn': True, 'username': user})
    return jsonify({'loggedIn': False}), 401


@app.route('/api/admin/logout', methods=['POST'])
def admin_logout():
    return jsonify({'success': True})

# ── Seed ──────────────────────────────────────────────────────────

@app.route('/api/seed', methods=['POST'])
def seed():
    if Complaint.query.count() > 0:
        return jsonify({'message': 'Already has data — skipping seed.'}), 200

    samples = [
        ('#a7f2','Infrastructure','Broken projectors in Block C classrooms',
         'Projectors in rooms C201, C202, and C204 have been non-functional for over 3 weeks. '
         'Multiple faculty have complained but no action has been taken. This seriously affects lecture quality.',
         23,'critical','high',True),
        ('#b3e9','Canteen','Food quality has significantly declined',
         'The canteen food quality has dropped drastically in the past month. Found insects in food on two '
         'occasions. Prices have increased but quality is much worse. Many students are now skipping meals.',
         18,'in-review','high',False),
        ('#c1d4','Hostel','Hot water not available in Hostel Block B',
         'Hot water has not been available in Hostel B for 10 days. Maintenance keeps saying it will be fixed '
         'tomorrow. This is affecting hygiene especially during cold mornings.',
         14,'in-review','medium',False),
        ('#d8f1','Academic','Attendance portal shows wrong data',
         'The attendance portal is showing incorrect attendance for multiple students. Some who attended all '
         'lectures are showing below 75% attendance, affecting exam eligibility.',
         31,'critical','high',True),
        ('#e2b7','Library','Library closes 2 hours before scheduled time',
         'The library has been closing at 6pm instead of the scheduled 8pm for the past 2 weeks. '
         'No notice was given. Students who stay for evening self-study are being affected.',
         7,'pending','medium',False),
        ('#f9c3','Safety','Streetlights near parking not working',
         'The streetlights near the main parking area have been out for a week. '
         'Students leaving late evenings feel unsafe. The path between lab block and hostel is completely dark.',
         9,'pending','high',False),
        ('#g4d8','Infrastructure','WiFi dead zones on 3rd and 4th floor',
         'The WiFi signal is completely absent on the 3rd and 4th floors of the academic building. '
         'This has been reported multiple times but no additional access points have been installed.',
         15,'resolved','medium',False),
        ('#h2k9','Administration','Fee receipts not issued on time',
         'Students who paid fees 3 weeks ago have not yet received receipts. '
         'This is causing issues during document verification and scholarship applications.',
         5,'pending','medium',False),
    ]

    for (anon_id, category, title, body, votes, status, priority, flagged) in samples:
        db.session.add(Complaint(
            anon_id=anon_id, category=category, title=title, body=body,
            votes=votes, status=status, priority=priority, flagged=flagged,
            created_at=datetime.utcnow()
        ))
    db.session.commit()
    return jsonify({'message': f'Seeded {len(samples)} complaints.'})

# ── Cleanup ───────────────────────────────────────────────────────

@app.route('/api/cleanup', methods=['POST'])
def cleanup_old_resolved():
    cutoff       = datetime.utcnow() - timedelta(days=30)
    old_resolved = Complaint.query.filter(
        Complaint.status == 'resolved',
        Complaint.created_at < cutoff
    ).all()
    count = len(old_resolved)
    for c in old_resolved:
        db.session.delete(c)
    db.session.commit()
    return jsonify({'message': f'Deleted {count} resolved complaint(s) older than 30 days.'})


if __name__ == '__main__':
    app.run(debug=True, port=5000)