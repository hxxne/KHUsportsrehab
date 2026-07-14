// DOM Elements
const uploadSection = document.getElementById('uploadSection');
const loadingSection = document.getElementById('loadingSection');
const resultSection = document.getElementById('resultSection');

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const previewContainer = document.getElementById('previewContainer');
const imagePreview = document.getElementById('imagePreview');
const aiReportContent = document.getElementById('aiReportContent');

let currentBase64Image = null;
let muscleChartInstance = null;
let fitnessChartInstance = null;

// Drag & Drop Handlers
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        alert('이미지 파일만 업로드 가능합니다.');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        imagePreview.src = e.target.result;
        currentBase64Image = e.target.result.split(',')[1]; // Remove data:image/jpeg;base64,
        dropZone.classList.add('hidden');
        previewContainer.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

// API Key 로드 및 저장
document.addEventListener('DOMContentLoaded', () => {
    const savedKey = localStorage.getItem('geminiApiKey');
    if (savedKey) {
        const input = document.getElementById('geminiApiKey');
        if (input) input.value = savedKey;
    }
});

function resetAnalyzer() {
    currentBase64Image = null;
    imagePreview.src = '';
    previewContainer.classList.add('hidden');
    resultSection.classList.add('hidden');
    dropZone.classList.remove('hidden');
    uploadSection.classList.remove('hidden');
}

// ------------------------------------------------------------------
// Gemini Vision API 호출 로직 추가
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
        
        const visionKeywords = ["2.5-flash", "2.0-flash", "1.5-flash", "1.5-pro", "vision"];
        let bestModel = null;
        for (const keyword of visionKeywords) {
            const found = validModels.find(m => m.name.includes(keyword));
            if (found) {
                bestModel = found.name.replace('models/', '');
                break;
            }
        }
        
        if (!bestModel) bestModel = "gemini-pro-vision";
        return bestModel;
    } catch (e) {
        console.warn("모델 자동 검색 실패", e);
        return "gemini-pro-vision"; 
    }
}
async function analyzeImage() {
    const apiKeyInput = document.getElementById('geminiApiKey');
    const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
    const userAge = document.getElementById('userAge').value;
    const userWeight = document.getElementById('userWeight').value;

    if (!apiKey) {
        alert('구글 Gemini API 키를 입력해주세요. 사진의 실제 수치를 분석하기 위해 필요합니다.');
        return;
    }

    if (!userAge || !userWeight) {
        alert('분석의 정확도를 높이기 위해 먼저 나이와 몸무게를 입력해 주세요!');
        return;
    }

    if (!currentBase64Image) {
        alert('이미지를 먼저 업로드해 주세요.');
        return;
    }

    localStorage.setItem('geminiApiKey', apiKey);

    uploadSection.classList.add('hidden');
    loadingSection.classList.remove('hidden');

    const prompt = `
당신은 경희대학교 스포츠재활센터의 수석 체력 및 인바디 분석 전문가입니다.
사용자가 나이 ${userAge}세, 몸무게 ${userWeight}kg의 인바디(체성분 분석표) 또는 체력 평가표 사진을 업로드했습니다.
사진에 적힌 텍스트와 수치(골격근량, 체지방률, 부위별 근육 발달 퍼센트 등)를 "사실 기반으로 정확히 읽어내어" 분석하세요.
수치가 안 보인다면 사진의 시각적 체형 단서를 바탕으로 평가하되, 무작위로 추정하지 마세요.

반드시 아래 JSON 형식으로만 응답하세요. 백틱이나 부연 설명 절대 금지.
{
  "muscle": {
    "left_arm": 사진에서 읽은 수치 또는 100점 만점 환산 점수 (숫자),
    "right_arm": 숫자,
    "trunk": 숫자,
    "left_leg": 숫자,
    "right_leg": 숫자
  },
  "fitness": {
    "strength": 근력 지수 (골격근량 등 팩트 기반, 0~100 숫자),
    "endurance": 근지구력 지수 (0~100 숫자),
    "cardio": 심폐지구력 지수 (0~100 숫자)
  },
  "feedback_html": "사진에서 직접 확인한 실제 수치(예: 골격근량 OOkg, 부위별 밸런스 등)를 구체적으로 언급하며 전문가적 관점에서 작성한 HTML 브리핑 (div, p, strong 태그 사용)"
}`;

    const requestBody = {
        contents: [{
            parts: [
                { text: prompt },
                { inlineData: { mimeType: "image/jpeg", data: currentBase64Image } }
            ]
        }],
        generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json"
        }
    };

    try {
        const modelName = await getBestGeminiModel(apiKey);
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errData = await response.json();
            console.error("API Error:", errData);
            const detailMsg = errData.error && errData.error.message ? errData.error.message : JSON.stringify(errData);
            throw new Error('API 통신 거절됨 (Google 서버 응답):\\n' + detailMsg);
        }
        
        const data = await response.json();
        let rawText = data.candidates[0].content.parts[0].text.trim();
        
        const startIndex = rawText.indexOf('{');
        const endIndex = rawText.lastIndexOf('}');
        if (startIndex !== -1 && endIndex !== -1) {
            rawText = rawText.substring(startIndex, endIndex + 1);
        }

        const parsedData = JSON.parse(rawText);
        
        const finalData = {
            muscle: parsedData.muscle,
            fitness: parsedData.fitness,
            feedback: parsedData.feedback_html
        };
        
        renderResults(finalData);
    } catch (error) {
        console.error("분석 중 오류 발생:", error);
        alert('분석 중 오류가 발생했습니다: ' + error.message);
        
        // 오류 시 UI 초기화
        loadingSection.classList.add('hidden');
        uploadSection.classList.remove('hidden');
    }
}

function renderResults(data) {
    loadingSection.classList.add('hidden');
    resultSection.classList.remove('hidden');

    // Render HTML Feedback
    aiReportContent.innerHTML = data.feedback;

    // Render Charts
    renderMuscleChart(data.muscle);
    renderFitnessChart(data.fitness);
}

function renderMuscleChart(muscleData) {
    const ctx = document.getElementById('muscleChart').getContext('2d');
    
    if (muscleChartInstance) {
        muscleChartInstance.destroy();
    }

    muscleChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['왼팔', '오른팔', '몸통', '왼다리', '오른다리'],
            datasets: [{
                label: '부위별 발달 점수 (100점 만점)',
                data: [
                    muscleData.left_arm, 
                    muscleData.right_arm, 
                    muscleData.trunk, 
                    muscleData.left_leg, 
                    muscleData.right_leg
                ],
                backgroundColor: [
                    'rgba(138, 21, 56, 0.7)',
                    'rgba(138, 21, 56, 0.7)',
                    'rgba(90, 14, 36, 0.7)',
                    'rgba(180, 40, 80, 0.7)',
                    'rgba(180, 40, 80, 0.7)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                y: { beginAtZero: true, max: 100 }
            }
        }
    });
}

function renderFitnessChart(fitnessData) {
    const ctx = document.getElementById('fitnessChart').getContext('2d');
    
    if (fitnessChartInstance) {
        fitnessChartInstance.destroy();
    }

    fitnessChartInstance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['근력 (Strength)', '근지구력 (Endurance)', '심폐지구력 (Cardio)'],
            datasets: [{
                label: '체력 지표',
                data: [fitnessData.strength, fitnessData.endurance, fitnessData.cardio],
                backgroundColor: 'rgba(138, 21, 56, 0.2)',
                borderColor: 'rgba(138, 21, 56, 1)',
                pointBackgroundColor: 'rgba(138, 21, 56, 1)',
                borderWidth: 2
            }]
        },
        options: {
            scales: {
                r: {
                    angleLines: { display: true },
                    suggestedMin: 0,
                    suggestedMax: 100
                }
            }
        }
    });
}
