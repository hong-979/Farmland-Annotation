import './styles.css';

function App() {
  return (
    <main className="import-shell">
      <section className="import-card" aria-labelledby="import-heading">
        <p className="eyebrow">本地专家工作台</p>
        <h1 id="import-heading">专家标注平台</h1>
        <p className="privacy-note">
          所有文件仅在本机浏览器中处理，不会上传到服务器。
        </p>

        <div className="file-fields">
          <label className="file-field" htmlFor="annotation-json">
            <span>选择标注 JSON</span>
            <input
              id="annotation-json"
              name="annotation-json"
              type="file"
              accept="application/json,.json"
            />
          </label>

          <label className="file-field" htmlFor="source-pdf">
            <span>选择对应 PDF</span>
            <input
              id="source-pdf"
              name="source-pdf"
              type="file"
              accept="application/pdf,.pdf"
            />
          </label>
        </div>
      </section>
    </main>
  );
}

export default App;
