// DOM Elements
const uploadSection = document.getElementById('uploadSection');
const loadingSection = document.getElementById('loadingSection');
const resultSection = document.getElementById('resultSection');

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const previewContainer = document.getElementById('previewContainer');
const imageGallery = document.getElementById('imageGallery'); // 새로 추가된 갤러리 컨테이너

let uploadedImages = []; // 다중 이미지 저장을 위한 배열 [{mimeType, base64, url}]

// Drag & Drop
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = '#8A1538'; });
dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = '#ccc'; });
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#ccc';
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFiles(e.target.files);
});

function handleFiles(files) {
    let hasImage = false;
    Array.from(files).forEach(file => {
        if (file.type.startsWith('image/')) {
            hasImage = true;
            const reader = new FileReader();
            reader.onload = (e) => {
                const base64 = e.target.result.split(',')[1];
                const mimeType = file.type;
                const url = e.target.result;
                
                uploadedImages.push({ mimeType, base64, url });
                renderGallery();
            };
            reader.readAsDataURL(file);
        }
    });

    if (!hasImage) {
        alert('현재 버전에서는 이미지 파일만 정밀 분석이 지원됩니다.');
        return;
    }

    dropZone.classList.add('hidden');
    previewContainer.classList.remove('hidden');
}

function renderGallery() {
    imageGallery.innerHTML = '';
    uploadedImages.forEach((imgObj, index) => {
        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        wrapper.style.display = 'inline-block';
        
        const img = document.createElement('img');
        img.src = imgObj.url;
        img.style.height = '150px';
        img.style.borderRadius = '8px';
        img.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
        img.style.border = '2px solid transparent';
        
        // 삭제 버튼
        const delBtn = document.createElement('button');
        delBtn.innerHTML = '×';
        delBtn.style.position = 'absolute';
        delBtn.style.top = '-5px';
        delBtn.style.right = '-5px';
        delBtn.style.background = '#e74c3c';
        delBtn.style.color = 'white';
        delBtn.style.border = 'none';
        delBtn.style.borderRadius = '50%';
        delBtn.style.width = '24px';
        delBtn.style.height = '24px';
        delBtn.style.cursor = 'pointer';
        delBtn.style.fontWeight = 'bold';
        
        delBtn.onclick = () => {
            uploadedImages.splice(index, 1);
            renderGallery();
            if (uploadedImages.length === 0) resetAnalyzer();
        };

        wrapper.appendChild(img);
        wrapper.appendChild(delBtn);
        imageGallery.appendChild(wrapper);
    });
}

function resetAnalyzer() {
    uploadedImages = [];
    imageGallery.innerHTML = '';
    previewContainer.classList.add('hidden');
    resultSection.classList.add('hidden');
    dropZone.classList.remove('hidden');
    uploadSection.classList.remove('hidden');
    
    // 기존 마커 초기화
    document.querySelectorAll('.alert-mark').forEach(el => el.remove());
    issueList.innerHTML = '';
    rxList.innerHTML = '';
}

// 부위별 실루엣 좌표 매핑 (퍼센트 기준)
const anatomyMap = {
    "머리/목": { top: "10%", left: "50%" },
    "어깨": { top: "25%", left: "30%" },
    "등/흉추": { top: "35%", left: "50%" },
    "허리/요추": { top: "50%", left: "50%" },
    "골반": { top: "55%", left: "50%" },
    "무릎": { top: "75%", left: "35%" },
    "발목/발": { top: "90%", left: "35%" }
};

// 페이지 로드 시 저장된 API 키 불러오기
document.addEventListener("DOMContentLoaded", () => {
    const savedKey = localStorage.getItem('geminiApiKey');
    if (savedKey) document.getElementById('geminiApiKey').value = savedKey;
});

// AI 분석 분기 처리
async function analyzeFMS() {
    if (uploadedImages.length === 0) return alert('이미지를 1장 이상 업로드해 주세요.');
    
    const apiKey = document.getElementById('geminiApiKey').value.trim();
    const selectedTest = document.getElementById('fmsTestSelect').value;

    if (apiKey) {
        // [옵션 A] 실제 Gemini Vision API 연동
        localStorage.setItem('geminiApiKey', apiKey);
        runGeminiVisionAPI(apiKey, selectedTest, uploadedImages);
    } else {
        // [옵션 B] 수동 체크리스트 모달 띄우기
        openManualModal(selectedTest);
    }
}

// ------------------------------------------------------------------
// [옵션 A] Gemini Vision API 호출
// ------------------------------------------------------------------
async function getBestGeminiModel(apiKey) {
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!res.ok) throw new Error('모델 목록 조회 실패');
        const data = await res.json();
        
        const validModels = data.models.filter(m => 
            m.supportedGenerationMethods && 
            m.supportedGenerationMethods.includes("generateContent")
        );
        
        // 반드시 '이미지 분석(Vision)' 기능을 지원하는 모델만 우선순위로 탐색
        const visionKeywords = ["2.5-flash", "2.0-flash", "1.5-flash", "1.5-pro", "vision"];
        
        let bestModel = null;
        for (const keyword of visionKeywords) {
            const found = validModels.find(m => m.name.includes(keyword));
            if (found) {
                bestModel = found.name.replace('models/', '');
                break; // 가장 최신의/적합한 비전 모델을 찾으면 중단
            }
        }
        
        // 만약 비전 모델을 못 찾았다면 최후의 수단으로 gemini-pro-vision 강제 지정
        if (!bestModel) {
            bestModel = "gemini-pro-vision";
        }
        
        return bestModel;
    } catch (e) {
        console.warn("모델 자동 검색 실패", e);
        return "gemini-pro-vision"; 
    }
}

async function runGeminiVisionAPI(apiKey, testName, imagesArray) {
    uploadSection.classList.add('hidden');
    loadingSection.classList.remove('hidden');

    const prompt = `
당신은 Gray Cook, Lee Burton, Stuart McGill, Craig Liebenson 등 세계적인 스포츠 의학 및 FMS 최고 권위자들이 빙의된 깐깐한 심사위원단입니다.
사용자가 업로드한 사진(들)은 '${testName}' 동작을 촬영한 것입니다.
오직 "업로드된 사진"에 실제로 보이는 관절의 축, 보상작용, 비대칭성만을 극도로 정밀하게 분석하세요. 존재하지 않는 증상을 지어내지 마세요.

다음 세 명의 학자 관점에서 개별적으로 점수(0~3점)를 매기고 한 줄 평을 남겨주세요:
1. Gray Cook: FMS 창시자로서 전체적인 가동성과 관절 중심화에 엄격함.
2. Stuart McGill: 요추 및 코어 안정성 세계 최고 권위자로서 척추의 미세한 굴곡(Butt wink 등)을 치명적 감점 요인으로 봄.
3. Craig Liebenson: 프라하 스쿨 및 재활 전문가로서 비대칭성과 발/발목의 무너짐, 운동 제어 능력에 집중함.

반드시 아래 JSON 형식으로만 응답하세요. 백틱이나 부연 설명은 절대 금지.
{
  "professor_scores": [
    { "name": "Gray Cook", "score": 2, "comment": "가동성은 양호하나..." },
    { "name": "Stuart McGill", "score": 1, "comment": "요추 말림이 뚜렷하여 코어 불안정이 의심됨." },
    { "name": "Craig Liebenson", "score": 2, "comment": "발목 내전이 아쉽지만 제어는 가능함." }
  ],
  "issues": [
    { 
      "part": "문제부위(머리/목,어깨,등/흉추,허리/요추,골반,무릎,발목/발 중 하나)", 
      "reason": "사진에서 실제로 관찰된 문제점에 대한 상세 설명",
      "citation": "해당 문제점과 관련된 특정 학자(예: Gray Cook 등)의 구체적인 평가 기준 및 출처"
    }
  ],
  "corrections": ["실제 관찰된 문제에 대한 교정 운동 1", "교정 운동 2"],
  "expert_opinion": "사진을 바탕으로 한 심사위원단의 종합 심층 분석 내용"
}`;

    // 프롬프트 텍스트 파트 먼저 넣기
    const partsArray = [ { text: prompt } ];
    
    // 업로드된 모든 이미지를 파트 배열에 추가
    imagesArray.forEach(imgObj => {
        partsArray.push({
            inlineData: { mimeType: imgObj.mimeType, data: imgObj.base64 }
        });
    });

    const requestBody = {
        contents: [{
            parts: partsArray
        }],
        generationConfig: {
            responseMimeType: "application/json"
        }
    };

    try {
        // 동적으로 사용 가능한 최적의 모델 찾기 (예: gemini-2.5-flash 등)
        const modelName = await getBestGeminiModel(apiKey);
        
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errData = await response.json();
            console.error("API Error Response:", errData);
            const detailMsg = errData.error && errData.error.message ? errData.error.message : JSON.stringify(errData);
            throw new Error('API 통신 거절됨 (Google 서버 응답):\n' + detailMsg);
        }
        
        const data = await response.json();
        let resultText = data.candidates[0].content.parts[0].text;
        
        // 마크다운 백틱 및 불필요한 텍스트가 섞인 경우를 대비하여 순수 JSON 블록만 추출
        const startIndex = resultText.indexOf('{');
        const endIndex = resultText.lastIndexOf('}');
        
        if (startIndex === -1 || endIndex === -1) {
            throw new Error('AI가 올바른 JSON 형식으로 응답하지 않았습니다.\n(응답 내용: ' + resultText.substring(0, 50) + '...)');
        }
        
        resultText = resultText.substring(startIndex, endIndex + 1);
        const parsedData = JSON.parse(resultText);
        
        renderFMSResults(testName, parsedData);

    } catch (error) {
        console.error(error);
        alert('AI 서버와 통신 중 오류가 발생했습니다.\n\n[오류 내용]\n' + error.message + '\n\n전문가 수동 평가 모드로 자동 전환합니다.');
        loadingSection.classList.add('hidden');
        openManualModal(testName);
    }
}

// ------------------------------------------------------------------
// [옵션 B] 수동 체크리스트 (API 대체재)
// ------------------------------------------------------------------
const manualChecklists = {
    "Deep Squat": [
        { id: "ds1", text: "상체와 정강이(Tibia) 선이 평행합니까? (출처: Cook et al. - 체간 및 골반 컨트롤 기준)" },
        { id: "ds2", text: "대퇴골이 수평선 아래로 내려갔습니까? (출처: FMS 깊이 기준)" },
        { id: "ds3", text: "무릎이 발끝선 안쪽으로 모이지 않았습니까? (출처: Craig Liebenson - Valgus 붕괴 검사)" },
        { id: "ds4", text: "발뒤꿈치가 바닥에서 떨어지지 않았습니까? (출처: 발목 배측굴곡 제한 검사)" }
    ],
    "Hurdle Step": [
        { id: "hs1", text: "고관절, 무릎, 발목이 일직선을 유지합니까? (출처: Lee Burton - 관절 중심화)" },
        { id: "hs2", text: "골반이 틀어지거나 한쪽으로 빠지지 않았습니까? (출처: Stuart McGill - 코어 안정성)" },
        { id: "hs3", text: "지지하는 다리의 무릎이 곧게 펴져 있습니까?" }
    ],
    "default": [
        { id: "d1", text: "통증 없이 동작을 수행했습니까? (통증 시 즉시 0점 처리 - FMS 프로토콜)" },
        { id: "d2", text: "목표한 관절 가동 범위를 완벽히 달성했습니까?" },
        { id: "d3", text: "몸통이나 다른 관절의 보상 작용(틀어짐)이 없습니까?" }
    ]
};

function openManualModal(testName) {
    const modal = document.getElementById('manualChecklistModal');
    const qContainer = document.getElementById('checklistQuestions');
    qContainer.innerHTML = '';

    const questions = manualChecklists[testName] || manualChecklists["default"];
    
    questions.forEach((q, idx) => {
        const div = document.createElement('div');
        div.style.marginBottom = '15px';
        div.innerHTML = `
            <p style="font-weight: 500; margin-bottom: 5px;">${idx + 1}. ${q.text}</p>
            <label><input type="radio" name="${q.id}" value="yes" checked> 예 (통과)</label>
            <label style="margin-left: 15px;"><input type="radio" name="${q.id}" value="no"> 아니오 (감점)</label>
        `;
        qContainer.appendChild(div);
    });

    modal.classList.add('show');
}

function closeManualModal() {
    document.getElementById('manualChecklistModal').classList.remove('show');
}

function submitManualChecklist() {
    closeManualModal();
    uploadSection.classList.add('hidden');
    
    const testName = document.getElementById('fmsTestSelect').value;
    const questions = manualChecklists[testName] || manualChecklists["default"];
    
    let failCount = 0;
    let failedQuestions = [];

    questions.forEach(q => {
        const selected = document.querySelector(`input[name="${q.id}"]:checked`).value;
        if (selected === 'no') {
            failCount++;
            failedQuestions.push(q.text);
        }
    });

    let score = 3;
    if (failCount === 1) score = 2;
    if (failCount >= 2) score = 1;

    let issues = [];
    if (failCount === 0) {
        issues.push({ 
            part: "골반", 
            reason: "모든 평가 기준을 완벽하게 통과했습니다. 보상작용 없음.",
            citation: "Gray Cook (2014) - 완벽한 가동성 및 안정성 통과 (3점)"
        });
    } else {
        failedQuestions.forEach(fq => {
            issues.push({ 
                part: "등/흉추", 
                reason: `체크리스트 미달: ${fq}`,
                citation: "FMS Assessment Protocol - 해당 항목 실패 시 1점 또는 2점으로 감점"
            });
        });
    }

    const mockData = {
        professor_scores: [
            { 
                name: "Gray Cook", 
                score: score, 
                comment: score === 3 ? "전반적인 가동성 패턴이 매우 훌륭합니다." : "보상작용이 확인되어 FMS 기준에 미달합니다." 
            },
            { 
                name: "Stuart McGill", 
                score: failCount > 0 ? 1 : 3, 
                comment: failCount > 0 ? "척추와 골반의 코어 통제력이 상실되어 부상 위험이 높습니다." : "요추 안정성이 견고하게 유지되고 있습니다." 
            },
            { 
                name: "Craig Liebenson", 
                score: failCount === 1 ? 2 : score, 
                comment: failCount === 1 ? "부분적인 모터 컨트롤 부재가 보이나 교정 가능합니다." : "관절 중심화 및 운동 제어 능력이 명확합니다." 
            }
        ],
        issues: issues,
        corrections: [
            score === 3 ? "현재의 훌륭한 패턴을 유지하기 위한 코어 안정화 훈련 지속" : "제한된 관절 가동성(Mobility) 회복을 위한 폼롤링 및 스트레칭",
            "동작 중 무너지는 부위의 Motor Control(운동 제어) 재교육 필요"
        ],
        expert_opinion: score === 3 ? 
            "전문가 의견: 심사위원단의 만장일치로 해당 회원은 Motor Control과 Mobility가 최상위권에 속합니다." :
            "전문가 의견: 위원회 평가 결과, 관절의 특정 부위가 붕괴되어 연쇄적인 보상작용을 일으키고 있습니다. 코어 제어 및 국소 부위 가동성 회복이 시급합니다."
    };

    renderFMSResults(testName, mockData);
}

// ------------------------------------------------------------------
// 공통 결과 렌더링
// ------------------------------------------------------------------
function renderFMSResults(testName, data) {
    loadingSection.classList.add('hidden');
    resultSection.classList.remove('hidden');

    document.getElementById('resultTestName').textContent = testName;
    
    // 교수진 개별 채점 패널 렌더링
    const scoreContainer = document.getElementById('professorScoresContainer');
    scoreContainer.innerHTML = '';
    
    if (data.professor_scores && Array.isArray(data.professor_scores)) {
        data.professor_scores.forEach(prof => {
            const card = document.createElement('div');
            let bgColor = prof.score === 3 ? '#2ecc71' : (prof.score === 2 ? '#f39c12' : '#e74c3c');
            let scoreText = prof.score + ' / 3 점';
            
            card.style.background = '#fff';
            card.style.border = '1px solid #ddd';
            card.style.borderRadius = '12px';
            card.style.padding = '15px';
            card.style.width = '30%';
            card.style.minWidth = '220px';
            card.style.boxShadow = '0 4px 6px rgba(0,0,0,0.05)';
            card.style.textAlign = 'left';

            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <strong style="color: #2c3e50; font-size: 1.1rem;">👨‍🏫 ${prof.name}</strong>
                    <span style="background: ${bgColor}; color: white; padding: 4px 8px; border-radius: 20px; font-weight: bold; font-size: 0.9rem;">
                        ${scoreText}
                    </span>
                </div>
                <p style="font-size: 0.85rem; color: #555; line-height: 1.4;">"${prof.comment}"</p>
            `;
            scoreContainer.appendChild(card);
        });
    }

    const humanSilhouette = document.getElementById('humanSilhouette');
    const issueList = document.getElementById('issueList');
    const rxList = document.getElementById('rxList');
    
    // 이전 마커 및 렌더링 초기화
    document.querySelectorAll('.alert-mark').forEach(el => el.remove());
    document.querySelectorAll('.expert-opinion-card').forEach(el => el.remove()); // 기존 전문가 카드 삭제
    issueList.innerHTML = '';
    rxList.innerHTML = '';

    // 🎓 전문가 심층 분석 (Expert Opinion) 영역 추가
    if (data.expert_opinion) {
        const expertDiv = document.createElement('div');
        expertDiv.className = 'card expert-opinion-card';
        expertDiv.style.marginBottom = '20px';
        expertDiv.style.backgroundColor = '#fdfbfb';
        expertDiv.style.borderLeft = '4px solid #2c3e50';
        expertDiv.innerHTML = `
            <h4 style="color: #2c3e50; margin-bottom: 10px; font-size: 1.1rem;">🎓 저명 학자들의 심층 분석 (Expert Opinion)</h4>
            <p style="font-size: 0.95rem; line-height: 1.6; color: #444;">${data.expert_opinion}</p>
        `;
        // details-container의 가장 위쪽에 삽입
        const detailsContainer = document.querySelector('.details-container');
        detailsContainer.insertBefore(expertDiv, detailsContainer.firstChild);
    }

    data.issues.forEach(issue => {
        const coords = anatomyMap[issue.part] || { top: "50%", left: "50%" };
        
        const mark = document.createElement('div');
        mark.className = 'alert-mark';
        mark.textContent = data.score === 3 ? '✅' : '⚠️';
        mark.style.top = coords.top;
        mark.style.left = coords.left;
        mark.title = issue.reason;
        
        humanSilhouette.appendChild(mark);

        const li = document.createElement('li');
        li.style.marginBottom = "15px";
        li.innerHTML = `
            <div><strong>[${issue.part}]</strong> ${issue.reason}</div>
            ${issue.citation ? `<div style="font-size: 0.85rem; color: #8A1538; margin-top: 5px; background: #fdf5f6; padding: 6px 10px; border-radius: 4px; border-left: 3px solid #8A1538;">
                📚 <strong>논문/학자 기준:</strong> ${issue.citation}
            </div>` : ''}
        `;
        issueList.appendChild(li);
    });

    data.corrections.forEach(rx => {
        const li = document.createElement('li');
        li.textContent = rx;
        rxList.appendChild(li);
    });
}

