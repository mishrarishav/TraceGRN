namespace APItrackGRN.Domain.Enums;

public enum IdentificationStrategyType
{
    GrnAndMaterial,
    GrnAndSapLine,
    GrnMaterialAndSapLine,
    Custom
}

public enum ImportStatus { Pending, Processing, Completed, CompletedWithWarnings, Failed, Duplicate }
public enum ImportResultType { New, Updated, Unchanged, Warning, Rejected }
public enum RevisionValidationStatus { Valid, Warning, Rejected, RequiresAdminReview }
public enum LabelStatus { Generated, Printed, Inwarded, Stored, Issued, Cancelled, Blocked }
public enum TransactionType { LabelGenerated, LabelPrinted, Inward, Issue, Cancel, Block, Unblock, Adjustment, Reprint }
public enum StationType { Inward, Issue, General }
