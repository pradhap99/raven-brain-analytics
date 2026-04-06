"""
Raven Brain Analytics - IG Reels Analyzer
Powered by Meta's Tribe V2
Local Streamlit app for analyzing video content brain engagement.
"""
import streamlit as st
import numpy as np
import json
import os
import tempfile
import subprocess
from pathlib import Path

st.set_page_config(
    page_title="Raven Brain Analytics",
    page_icon="🧠",
    layout="wide",
    initial_sidebar_state="expanded"
)

# --- Custom CSS for Jake-style dark dashboard ---
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
* { font-family: 'Inter', sans-serif; }
.stApp { background: #0a0a1a; color: #e2e8f0; }
[data-testid="stSidebar"] { background: #0f1129; border-right: 1px solid #1e293b; }
[data-testid="stHeader"] { background: transparent; }
h1, h2, h3 { color: #f1f5f9 !important; }
.metric-card {
    background: linear-gradient(135deg, #111827 0%, #1a1a3e 100%);
    border: 1px solid #2d3748;
    border-radius: 16px;
    padding: 24px;
    text-align: center;
    transition: transform 0.2s, box-shadow 0.2s;
}
.metric-card:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(99,102,241,0.15); }
.metric-value { font-size: 2.2rem; font-weight: 800; background: linear-gradient(135deg, #6366f1, #ec4899); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.metric-label { font-size: 0.85rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 4px; }
.section-badge {
    display: inline-block; padding: 6px 16px; border-radius: 20px; font-size: 0.8rem;
    font-weight: 600; letter-spacing: 0.05em;
}
.badge-best { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); }
.badge-weak { background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3); }
.insight-card {
    background: #111827; border-left: 4px solid #6366f1; border-radius: 8px;
    padding: 16px 20px; margin: 8px 0; color: #cbd5e1; font-size: 0.95rem;
}
.hero-title {
    font-size: 2.5rem; font-weight: 800; text-align: center;
    background: linear-gradient(135deg, #6366f1 0%, #ec4899 50%, #f59e0b 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 0;
}
.hero-sub { text-align: center; color: #64748b; font-size: 1.1rem; margin-top: 4px; }
.stButton > button {
    background: linear-gradient(135deg, #6366f1, #8b5cf6) !important;
    color: white !important; border: none !important; border-radius: 12px !important;
    padding: 12px 32px !important; font-weight: 600 !important; font-size: 1rem !important;
    transition: all 0.3s !important;
}
.stButton > button:hover { transform: translateY(-1px) !important; box-shadow: 0 4px 24px rgba(99,102,241,0.4) !important; }
</style>
""", unsafe_allow_html=True)

# --- Sidebar ---
with st.sidebar:
    st.markdown("### ⚙️ Settings")
    st.markdown("---")
    sections_config = st.text_area(
        "Define sections (JSON)",
        value='{\n  "hook": [0, 3],\n  "intro": [3, 6],\n  "main": [6, 10],\n  "cta": [10, null]\n}',
        height=160
    )
    st.markdown("---")
    st.markdown("**How it works:**")
    st.markdown("1. Upload your IG Reel (.mp4)")
    st.markdown("2. Tribe V2 predicts brain fMRI responses")
    st.markdown("3. Get engagement analytics & insights")
    st.markdown("---")
    st.caption("Powered by Meta TRIBE v2 • Built by Raven Labs")

# --- Hero ---
st.markdown('<p class="hero-title">🧠 Raven Brain Analytics</p>', unsafe_allow_html=True)
st.markdown('<p class="hero-sub">Predict how brains react to your IG Reels using Meta\'s Tribe V2</p>', unsafe_allow_html=True)
st.markdown("")

# --- Upload ---
uploaded = st.file_uploader("Upload your IG Reel", type=["mp4", "mov", "avi", "webm"], label_visibility="collapsed")

if uploaded is not None:
    col_vid, col_info = st.columns([1, 1])
    with col_vid:
        st.video(uploaded)
    with col_info:
        st.markdown("### 📹 Video Info")
        st.markdown(f"**Filename:** `{uploaded.name}`")
        st.markdown(f"**Size:** `{uploaded.size / 1024 / 1024:.2f} MB`")

    if st.button("🚀 Analyze Brain Engagement", use_container_width=True):
        with st.spinner("Running Tribe V2 analysis... This takes a few minutes on GPU."):
            # Save uploaded file
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4")
            tmp.write(uploaded.read())
            tmp.close()

            # Run the analysis script
            result = subprocess.run(
                ["python", "analyze.py", tmp.name],
                capture_output=True, text=True, timeout=600
            )

            if result.returncode != 0:
                st.error(f"Analysis failed: {result.stderr}")
                st.stop()

            payload = json.loads(result.stdout)
            os.unlink(tmp.name)

        # --- Results Dashboard ---
        st.markdown("---")
        st.markdown("## 📊 Brain Engagement Dashboard")

        # Metrics row
        summary = payload["summary"]
        cols = st.columns(6)
        metrics = [
            ("Attention Score", f"{summary['predicted_attention']:.4f}", "🎯"),
            ("Peak Activation", f"{summary['peak_activation']:.4f}", "⚡"),
            ("Peak Segment", f"{summary['peak_segment']}", "📍"),
            ("CTA Strength", f"{summary['cta_strength']:.4f}", "💪"),
            ("Cognitive Load", f"{summary['cognitive_load']}", "🧩"),
            ("Segments", f"{summary['predicted_segments']}", "📐"),
        ]
        for col, (label, value, icon) in zip(cols, metrics):
            with col:
                st.markdown(f"""
                <div class="metric-card">
                    <div style="font-size:1.5rem">{icon}</div>
                    <div class="metric-value">{value}</div>
                    <div class="metric-label">{label}</div>
                </div>
                """, unsafe_allow_html=True)

        st.markdown("")

        # Timeline chart
        col_chart, col_sections = st.columns([2, 1])
        with col_chart:
            st.markdown("### 📈 Engagement Timeline")
            import plotly.graph_objects as go
            timeline = payload["timeline"]
            fig = go.Figure()
            fig.add_trace(go.Scatter(
                y=timeline, mode='lines+markers',
                line=dict(color='#6366f1', width=3),
                marker=dict(size=6, color='#6366f1'),
                fill='tozeroy', fillcolor='rgba(99,102,241,0.1)',
                name='Brain Activation'
            ))
            peak_idx = int(np.argmax(timeline))
            fig.add_trace(go.Scatter(
                x=[peak_idx], y=[timeline[peak_idx]],
                mode='markers+text', marker=dict(size=14, color='#f59e0b', symbol='star'),
                text=[f'Peak'], textposition='top center',
                textfont=dict(color='#f59e0b', size=12), name='Peak', showlegend=False
            ))
            fig.update_layout(
                template='plotly_dark', paper_bgcolor='#0a0a1a', plot_bgcolor='#111827',
                xaxis_title='Segment (seconds)', yaxis_title='Activation',
                height=400, margin=dict(l=40, r=20, t=20, b=40),
                font=dict(color='#94a3b8')
            )
            st.plotly_chart(fig, use_container_width=True)

        with col_sections:
            st.markdown("### 🏆 Section Ranking")
            sections = payload["sections"]
            for i, sec in enumerate(sections):
                badge = "badge-best" if i == 0 else ("badge-weak" if i == len(sections)-1 else "")
                bar_width = int((sec["score"] / sections[0]["score"]) * 100)
                st.markdown(f"""
                <div style="margin:12px 0">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                        <span style="font-weight:600;color:#f1f5f9">{sec['name']}</span>
                        <span class="section-badge {badge}">{sec['score']:.4f}</span>
                    </div>
                    <div style="background:#1e293b;border-radius:8px;height:8px;margin-top:6px">
                        <div style="background:linear-gradient(90deg,#6366f1,#ec4899);width:{bar_width}%;height:8px;border-radius:8px"></div>
                    </div>
                </div>
                """, unsafe_allow_html=True)

        # Insights
        st.markdown("---")
        st.markdown("### 💡 AI Insights")
        for insight in payload.get("insights", []):
            st.markdown(f'<div class="insight-card">{insight}</div>', unsafe_allow_html=True)

        # Decision support
        st.markdown("---")
        st.markdown("### 🎯 Decision Support")
        tab_pm, tab_design, tab_mktg = st.tabs(["Product Manager", "Designer", "Marketing"])
        for tab, role in [(tab_pm, "product_manager"), (tab_design, "designer"), (tab_mktg, "marketing_manager")]:
            with tab:
                for tip in payload.get("decision_support", {}).get(role, []):
                    st.markdown(f'<div class="insight-card">{tip}</div>', unsafe_allow_html=True)

        # Export
        st.markdown("---")
        st.download_button(
            "📥 Download Full Report (JSON)",
            data=json.dumps(payload, indent=2),
            file_name="raven_brain_report.json",
            mime="application/json"
        )

else:
    st.markdown("")
    st.markdown("""
    <div style="text-align:center;padding:60px 20px;background:#111827;border-radius:20px;border:1px dashed #2d3748">
        <div style="font-size:4rem">🎬</div>
        <h3 style="color:#f1f5f9;margin:16px 0 8px">Drop your IG Reel here</h3>
        <p style="color:#64748b">Upload an MP4 video to analyze brain engagement patterns</p>
    </div>
    """, unsafe_allow_html=True)
