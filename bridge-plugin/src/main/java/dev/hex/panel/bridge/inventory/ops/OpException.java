package dev.hex.panel.bridge.inventory.ops;

/** Failure of a batch. The whole batch is rejected; nothing is applied. */
public class OpException extends RuntimeException {
    private final int status;
    private final String code;
    private final int opIndex;

    public OpException(int status, String code, int opIndex, String message) {
        super(message);
        this.status = status;
        this.code = code;
        this.opIndex = opIndex;
    }

    /** HTTP status: 400 bad request, 409 conflict, 422 rejected by rules, 501 not supported. */
    public int status() { return status; }

    public String code() { return code; }

    public int opIndex() { return opIndex; }
}
