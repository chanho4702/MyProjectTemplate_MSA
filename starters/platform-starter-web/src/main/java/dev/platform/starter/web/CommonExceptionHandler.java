package dev.platform.starter.web;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.MDC;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;

import java.net.URI;
import java.util.List;
import java.util.Map;

@RestControllerAdvice
final class CommonExceptionHandler {
    @ExceptionHandler(ApiException.class)
    ProblemDetail handleApiException(ApiException exception, HttpServletRequest request) {
        return problem(exception.status(), exception.code(), exception.getMessage(), request);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail handleValidation(MethodArgumentNotValidException exception, HttpServletRequest request) {
        ProblemDetail problem = problem(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_FAILED",
                "The request contains invalid values.",
                request
        );
        List<Map<String, String>> violations = exception.getBindingResult().getFieldErrors().stream()
                .map(error -> Map.of(
                        "field", error.getField(),
                        "message", error.getDefaultMessage() == null ? "invalid" : error.getDefaultMessage()
                ))
                .toList();
        problem.setProperty("violations", violations);
        return problem;
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    ProblemDetail handleParameterValidation(HandlerMethodValidationException exception, HttpServletRequest request) {
        ProblemDetail problem = problem(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_FAILED",
                "The request contains invalid values.",
                request
        );
        List<Map<String, String>> violations = exception.getParameterValidationResults().stream()
                .flatMap(result -> result.getResolvableErrors().stream()
                        .map(error -> Map.of(
                                "field", parameterName(result.getMethodParameter()),
                                "message", error.getDefaultMessage() == null ? "invalid" : error.getDefaultMessage()
                        )))
                .toList();
        problem.setProperty("violations", violations);
        return problem;
    }

    private static String parameterName(MethodParameter parameter) {
        RequestParam requestParam = parameter.getParameterAnnotation(RequestParam.class);
        if (requestParam != null && !requestParam.name().isEmpty()) {
            return requestParam.name();
        }
        if (requestParam != null && !requestParam.value().isEmpty()) {
            return requestParam.value();
        }
        String name = parameter.getParameterName();
        return name != null ? name : "parameter" + parameter.getParameterIndex();
    }

    private static ProblemDetail problem(
            HttpStatus status,
            String code,
            String detail,
            HttpServletRequest request
    ) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(status.getReasonPhrase());
        problem.setType(URI.create("urn:problem:" + code.toLowerCase().replace('_', '-')));
        problem.setInstance(URI.create(request.getRequestURI()));
        problem.setProperty("code", code);
        String requestId = MDC.get(RequestIdFilter.MDC_KEY);
        if (requestId != null) {
            problem.setProperty("requestId", requestId);
        }
        return problem;
    }
}
