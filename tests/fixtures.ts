export const validRawDocument = {
  project_id: 'synthetic-project',
  output: [
    {
      label: '水资源',
      review_point: '核对可供水量是否包含计算过程。',
      verification_status: '[错误]',
      evidence_fragments: [
        {
          page_number: '2',
          original_text: '测试证据文本',
          evidence_role: '直接冲突',
          upstream_note: 'preserve me',
        },
      ],
      judgment_basis: '已有结果缺少计算过程。',
      page_numbers: [2],
      upstream_task_id: 'task-1',
    },
  ],
  root_extension: { keep: true },
};

export const validRawText = JSON.stringify(validRawDocument);
